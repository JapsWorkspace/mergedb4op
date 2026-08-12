const {
  checkUniSmsBalance,
  sendUniSms,
  normalizePhilippinePhoneNumber,
  trimSmsMessage,
} = require("./sendUniSms");

function toPhilSmsPhoneFormat(phone) {
  const normalized = normalizePhilippinePhoneNumber(phone);
  return normalized ? normalized.replace(/^\+/, "") : "";
}

module.exports = {
  checkPhilSmsBalance: checkUniSmsBalance,
  sendPhilSms: sendUniSms,
  normalizePhilippinePhoneNumber,
  toPhilSmsPhoneFormat,
  trimSmsMessage,
};
