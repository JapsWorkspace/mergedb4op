const UserModel = require("../models/History");

const getHistory = (req, res) => {
    UserModel.find()
    .then(histories => res.json(histories))
    .catch(err => {
        console.log(err)
         res.status(500).json({error: "Internal  Server Error"});
    })

}

const registerHistory = (req, res) => {
    const newHistory = new UserModel(req.body);
    newHistory.save()
    .then(histories => res.json(histories))
    .catch(err => {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    });
};

module.exports = { getHistory, registerHistory };