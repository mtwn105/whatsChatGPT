const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const axios = require("axios").default;

require("dotenv").config();

const app = express();

const port = process.env.PORT || 3000;

// parse the updates to JSON
app.use(express.json());
app.use(cors());
app.use(morgan("combined"));

app.use(helmet.crossOriginOpenerPolicy({ policy: "same-origin-allow-popups" }));
app.use(helmet.crossOriginResourcePolicy());
app.use(helmet.noSniff());
app.use(helmet.originAgentCluster());
app.use(helmet.ieNoOpen());
app.use(
  helmet.frameguard({
    action: "sameorigin",
  })
);
app.use(helmet.hidePoweredBy());
app.use(helmet.xssFilter());

// API Routes
app.post("/api/webhook", async (req, res) => {
  // let message = req.body.message;

  console.log("Received message ");

  // Parse the request body from the POST
  const body = req.body;

  // Check the Incoming webhook message
  console.log("Incoming webhook: " + JSON.stringify(body));

  // Validate the webhook
  if (req.body.object) {
    // Handle the event
    if (req.body.object === "whatsapp_business_account") {
      const entry = req.body.entry[0];

      // Handle the message
      if (entry.changes) {
        for (const change of entry.changes) {
          if (
            change.value &&
            change.field === "messages" &&
            change.value.contacts &&
            change.value.messages
          ) {
            // Handle the value
            const value = change.value;

            const userName = value.contacts[0].profile.name;

            const messages = value.messages;

            // Handle messages
            for (const message of messages) {
              if (
                message.type === "text" &&
                message.text &&
                message.text.body
              ) {
                const waid = message.from;
                const text = message.text.body;
                const msgId = message.id;
                console.log(
                  "Message from " + waid + " - " + userName + ": " + text
                );

                try {
                  await axios.post(
                    process.env.WHATSAPP_SEND_MESSAGE_API,
                    {
                      messaging_product: "whatsapp",
                      status: "read",
                      message_id: msgId,
                    },
                    {
                      headers: {
                        Authorization: "Bearer " + process.env.WHATSAPP_TOKEN,
                      },
                    }
                  );
                } catch (error) {
                  console.error(
                    "Error while sending status message to whatsapp: " + error
                  );
                }

                const { ChatGPTAPI } = await import("chatgpt");

                // sessionToken is required; see below for details
                const api = new ChatGPTAPI({
                  sessionToken: process.env.SESSION_TOKEN,
                });

                // ensure the API is properly authenticated
                await api.ensureAuth();

                // send a message and wait for the response
                const reply = await api.sendMessage(text);

                console.log("Replying to " + waid + ": " + reply);

                // Send reply to user
                try {
                  await axios.post(
                    process.env.WHATSAPP_SEND_MESSAGE_API,
                    {
                      messaging_product: "whatsapp",
                      recipient_type: "individual",
                      to: waid,
                      type: "text",
                      text: {
                        preview_url: false,
                        body: reply,
                      },
                    },
                    {
                      headers: {
                        Authorization: "Bearer " + process.env.WHATSAPP_TOKEN,
                      },
                    }
                  );
                } catch (whatsappSendError) {
                  console.error(
                    "Error while sending message to whatsapp: " +
                      JSON.stringify(whatsappSendError.response.data)
                  );
                }
              }
            }
          }
        }
      }
    }
    res.sendStatus(200);
  } else {
    // Return a '404 Not Found' if event is not from a whatsApp API
    res.sendStatus(404);
  }
});

// Accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
app.get("/api/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  // Parse params from the webhook verification request
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  console.log("PAR" + JSON.stringify(req.query));

  // Check if a token and mode were sent
  if (!mode || !token) {
    return res.status(403).send({ error: "Missing mode or token" });
  }

  // Check the mode and token sent are correct
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    // Respond with 200 OK and challenge token from the request
    console.log("WEBHOOK_VERIFIED");
    return res.status(200).send(challenge);
  } else {
    // Responds with '403 Forbidden' if verify tokens do not match
    return res.sendStatus(403);
  }
});

// Error Handler
notFound = (req, res, next) => {
  res.status(404);
  const error = new Error("Not Found - " + req.originalUrl);
  next(error);
};

errorHandler = (err, req, res) => {
  res.status(res.statusCode || 500);
  res.json({
    error: err.name,
    message: err.message,
  });
};

app.use(notFound);
app.use(errorHandler);

app.listen(port, async () => {
  console.log(`WhatsChatGPT server is listening on ${port}`);
});
