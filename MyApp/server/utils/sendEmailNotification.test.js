const test = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

const sendEmailNotification = require("./sendEmailNotification");

function withEnv(nextEnv, fn) {
  const previous = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
  };

  Object.assign(process.env, nextEnv);

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("buildHtml escapes user content and preserves paragraph breaks", () => {
  const html = sendEmailNotification.buildHtml('Hello <Admin>\nline 2\n\nUse "quotes" & more');

  assert.match(html, /Hello &lt;Admin&gt;<br>line 2/);
  assert.match(html, /Use &quot;quotes&quot; &amp; more/);
  assert.match(html, /<p>/);
});

test("sendEmailNotification uses Resend when RESEND_API_KEY is configured", async () => {
  const originalFetch = global.fetch;
  let request;

  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { id: "re_test_123" };
      },
    };
  };

  try {
    const result = await withEnv(
      {
        RESEND_API_KEY: "re_key",
        EMAIL_FROM: "alerts@example.com",
        SMTP_FROM: "",
        SMTP_USER: "",
        SMTP_PASS: "",
        SMTP_HOST: "",
        SMTP_PORT: "",
        SMTP_SECURE: "",
        EMAIL_USER: "",
        EMAIL_PASS: "",
      },
      () =>
        sendEmailNotification({
          to: "user@example.com",
          subject: "Subject",
          message: "Hello world",
        })
    );

    assert.equal(result.ok, true);
    assert.equal(result.messageId, "re_test_123");
    assert.equal(request.url, "https://api.resend.com/emails");

    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, ["user@example.com"]);
    assert.equal(body.from, "SAGIP BAYAN <alerts@example.com>");
    assert.equal(body.subject, "Subject");
    assert.equal(body.text, "Hello world");
  } finally {
    global.fetch = originalFetch;
  }
});

test("sendEmailNotification falls back to SMTP when Resend is not configured", async () => {
  const originalCreateTransport = nodemailer.createTransport;
  let transportConfig;
  let sentMail;

  nodemailer.createTransport = (config) => {
    transportConfig = config;
    return {
      async sendMail(mail) {
        sentMail = mail;
        return { messageId: "smtp_test_456" };
      },
    };
  };

  try {
    const result = await withEnv(
      {
        RESEND_API_KEY: "",
        EMAIL_FROM: "alerts@example.com",
        SMTP_USER: "smtp-user",
        SMTP_PASS: "smtp-pass",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "2525",
        SMTP_SECURE: "true",
      },
      () =>
        sendEmailNotification({
          to: "user@example.com",
          subject: "SMTP Subject",
          message: "SMTP body",
        })
    );

    assert.equal(result.ok, true);
    assert.equal(result.messageId, "smtp_test_456");
    assert.equal(transportConfig.host, "smtp.example.com");
    assert.equal(transportConfig.port, 2525);
    assert.equal(transportConfig.secure, true);
    assert.equal(sentMail.from, "SAGIP BAYAN <alerts@example.com>");
    assert.equal(sentMail.to, "user@example.com");
    assert.equal(sentMail.subject, "SMTP Subject");
    assert.equal(sentMail.text, "SMTP body");
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }
});
