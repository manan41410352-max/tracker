import arcjet, { tokenBucket } from "@arcjet/next";

export const aj = process.env.ARCJET_KEY
  ? arcjet({
      key: process.env.ARCJET_KEY,
      rules: [
        tokenBucket({
          mode: "LIVE",
          characteristics: ["userId"],
          refillRate: 5000,
          interval: 30 * 24 * 60 * 60 * 1000,
          capacity: 50000,
        }),
      ],
    })
  : null;
