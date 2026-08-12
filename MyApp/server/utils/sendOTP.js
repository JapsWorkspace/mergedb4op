const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// EXPORT A FUNCTION THAT ACCEPTS (email, otp)
const sendOTP = (email, otp) => {
  return transporter.sendMail({
    from: "No Reply <no-reply@yourapp.com>",
    to: email,
    subject: "Your OTP Code",
    html: `
      <h2>OTP Verification</h2>
      <p>Your one-time password is:</p>
      <h1>${otp}</h1>
      <p>This code will expire in 5 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    `
  });
};
module.exports = sendOTP;