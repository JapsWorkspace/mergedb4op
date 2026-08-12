const MRCLog = require('../models/MRCLog');

const logMRC = async ({
  module,
  action,
  item,
  quantity,
  description,
  req,
  proofFiles = []
}) => {

  try {

    await MRCLog.create({
      module,
      action,
      item,
      quantity,
      description,
      proofFiles,

      performedBy: req.session.userId,
      username: req.session.username,
      role: req.session.role

    });

  } catch (err) {

    console.error('MRC ERROR:', err.message);

  }

};

module.exports = logMRC;