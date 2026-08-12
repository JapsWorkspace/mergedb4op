const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/UserStaff.js');
const Barangay = require('../models/Barangay.js');
const ArchivedAccount = require('../models/ArchivedAccount.js');
const AccountApprovalRequest = require('../models/AccountApprovalRequest.js');
const AccountUpdateApprovalRequest = require('../models/AccountUpdateApprovalRequest.js');
const TimeLog = require('../models/TimeLog');
const AdminLog = require('../models/AdminLog');
const UserStaff = require('../models/UserStaff.js');
const sendAccountApprovalEmail = require('../utils/sendAccountApprovalEmail');
const sendAccountUpdateApprovalEmail = require('../utils/sendAccountUpdateApprovalEmail');
const createAuditEvent = require('../utils/createAuditEvent');

const CONTROL_AND_MARKUP = /[<>`]/g;

function removeControlChars(value) {
  return String(value ?? '')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
}

function sanitizeText(value) {
  return removeControlChars(value).replace(CONTROL_AND_MARKUP, '');
}

function sanitizeUsername(value) {
  return sanitizeText(value).replace(/[^a-zA-Z0-9 _.-]/g, '');
}

function sanitizeEmail(value) {
  return sanitizeText(value).replace(/\s+/g, '').trim();
}

function sanitizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 11);
}

function sanitizeHotline(value) {
  return sanitizeText(value).replace(/[^0-9+\-() extEXT]/g, '');
}

function sanitizeAddress(value) {
  return sanitizeText(value).trim();
}

function sanitizePassword(value) {
  return removeControlChars(value);
}

function sanitizeThemePreference(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'light' ? 'light' : 'dark';
}

const BARANGAY_OPTIONS = [
  "Calabasa",
  "Don Mariano Marcos",
  "Dampulan",
  "Hilera",
  "Imbunia",
  "Lambakin",
  "Langla",
  "Magsalisi",
  "Malabon Kaingin",
  "Marawa",
  "Niyugan",
  "Pamacpacan",
  "Pakol",
  "Pinanggaan",
  "Putlod",
  "San Jose",
  "San Josef (Nabao)",
  "San Pablo",
  "San Roque",
  "San Vicente",
  "Santa Rita",
  "Sapang",
  "Santo Tomas North",
  "Santo Tomas South",
  "Ulanin Pitak"
];

const ACCOUNT_APPROVAL_TTL_MS = 10 * 60 * 1000;
const ACCOUNT_UPDATE_TTL_MS = 10 * 60 * 1000;

function hashApprovalToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildApprovalLink(req, token) {
  const baseUrl =
    process.env.PUBLIC_API_URL?.trim() ||
    `${req.protocol}://${req.get('host')}`;

  return `${baseUrl}/api/auth/approve-account/${token}`;
}

function buildUpdateApprovalLink(req, token) {
  const baseUrl =
    process.env.PUBLIC_API_URL?.trim() ||
    `${req.protocol}://${req.get('host')}`;

  return `${baseUrl}/api/auth/approve-account-update/${token}`;
}

async function markExpiredApprovalRequest(doc) {
  if (!doc) return null;

  if (doc.status === 'pending' && doc.approvalExpiresAt <= new Date()) {
    doc.status = 'expired';
    await doc.save();
  }

  return doc;
}

async function findPendingApprovalByEmail(email) {
  const pending = await AccountApprovalRequest.findOne({
    email,
    status: 'pending'
  });

  return markExpiredApprovalRequest(pending);
}

async function findPendingApprovalByBarangay(barangayName) {
  if (!barangayName) return null;

  const pending = await AccountApprovalRequest.findOne({
    barangayName,
    role: 'barangay',
    status: 'pending'
  });

  return markExpiredApprovalRequest(pending);
}

async function markExpiredUpdateApprovalRequest(doc) {
  if (!doc) return null;

  if (doc.status === 'pending' && doc.approvalExpiresAt <= new Date()) {
    doc.status = 'expired';
    await doc.save();
  }

  return doc;
}

async function findPendingUpdateApprovalByAccount(accountId) {
  const pending = await AccountUpdateApprovalRequest.findOne({
    accountId,
    status: 'pending'
  });

  return markExpiredUpdateApprovalRequest(pending);
}

async function createAccountFromApprovalRequest(approvalRequest) {
  if (approvalRequest.role === 'barangay') {
    return Barangay.create({
      username: approvalRequest.username,
      email: approvalRequest.email,
      password: approvalRequest.password,
      barangayName: approvalRequest.barangayName,
      verified: true,
      phoneNumber: approvalRequest.phoneNumber,
      hotline: approvalRequest.hotline,
      address: approvalRequest.address,
      themePreference: approvalRequest.themePreference || 'dark'
    });
  }

  return User.create({
    username: approvalRequest.username,
    email: approvalRequest.email,
    password: approvalRequest.password,
    role: approvalRequest.role,
    verified: true,
    phoneNumber: approvalRequest.phoneNumber,
    hotline: approvalRequest.hotline,
    address: approvalRequest.address,
    themePreference: approvalRequest.themePreference || 'dark'
  });
}

function renderApprovalPage({
  title,
  message,
  success = false
}) {
  const accent = success ? '#166534' : '#b42318';
  const soft = success ? '#edf8ef' : '#fff4f4';
  const border = success ? '#c4e0ca' : '#efc9c9';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0; font-family:Arial, sans-serif; background:#edf5ef; color:#173122;">
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;">
      <div style="width:min(560px, 100%); background:#ffffff; border:1px solid ${border}; border-radius:24px; box-shadow:0 24px 60px rgba(15,23,42,0.14); overflow:hidden;">
        <div style="padding:28px 28px 20px; background:linear-gradient(135deg, #ffffff 0%, #f7fbf8 100%); border-bottom:1px solid ${border};">
          <div style="display:inline-flex; align-items:center; min-height:30px; padding:0 12px; border-radius:999px; background:${soft}; color:${accent}; font-size:12px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase;">SAGIP BAYAN</div>
          <h1 style="margin:14px 0 0; font-size:30px; line-height:1.1; color:${accent};">${title}</h1>
        </div>
        <div style="padding:24px 28px 28px;">
          <p style="margin:0; font-size:15px; line-height:1.7; color:#476152;">${message}</p>
          <p style="margin:18px 0 0; font-size:13px; color:#607667;">You can now log in to your account.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function buildUpdateSummary({
  account,
  username,
  phoneNumber,
  hotline,
  address,
  hasPasswordChange
}) {
  const summary = [];

  if (username !== account.username) {
    summary.push({ label: 'Username', value: `${account.username} -> ${username}` });
  }

  if (phoneNumber !== (account.phoneNumber || '')) {
    summary.push({
      label: 'Phone Number',
      value: `${account.phoneNumber || '-'} -> ${phoneNumber || '-'}`
    });
  }

  if ((hotline || '') !== (account.hotline || '')) {
    summary.push({
      label: 'Hotline',
      value: `${account.hotline || '-'} -> ${hotline || '-'}`
    });
  }

  if (address !== (account.address || '')) {
    summary.push({
      label: 'Address',
      value: `${account.address || '-'} -> ${address || '-'}`
    });
  }

  if (hasPasswordChange) {
    summary.push({
      label: 'Password',
      value: 'Password will be replaced after approval'
    });
  }

  return summary;
}

/* INIT ADMIN */
const initAdmin = async (req, res) => {
  try {

    const admin = await User.findOne({ role: 'admin' });

    if (!admin) {

      const hashed = await bcrypt.hash('admin123', 10);

      await User.create({
        username: 'admin',
        email: 'admin@drrmo.gov.ph',
        password: hashed,
        role: 'admin',
        verified: true,
        phoneNumber: '0000000000',
        address: 'DRRMO Main Office'
      });

    }

    res.send('Admin ready');

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


/* REGISTER */
const register = async (req, res) => {
  try {
    const {
      role,
      email,
      password,
      username,
      barangay,
      phoneNumber,
      hotline,
      address
    } = req.body;

    const cleanRole = String(role || '').toLowerCase().trim();
    const cleanUsername = sanitizeUsername(username);
    const cleanEmail = sanitizeEmail(email);
    const cleanPhoneNumber = sanitizePhoneNumber(phoneNumber);
    const cleanHotline = sanitizeHotline(hotline);
    const cleanAddress = sanitizeAddress(address);
    const cleanPassword = sanitizePassword(password);
    const cleanBarangay = sanitizeText(barangay).trim();

    if (!cleanRole || !cleanPassword || !cleanUsername || !cleanPhoneNumber || !cleanAddress) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!['barangay', 'drrmo', 'accountant'].includes(cleanRole)) {
      return res.status(400).json({ message: 'Invalid account role' });
    }

    if (!cleanEmail) {
      return res.status(400).json({ message: 'Email required' });
    }

    if (cleanRole === 'barangay') {
      if (!cleanBarangay) {
        return res.status(400).json({ message: 'Missing barangay details' });
      }

      if (!BARANGAY_OPTIONS.includes(cleanBarangay)) {
        return res.status(400).json({ message: 'Invalid barangay selected' });
      }
    }

    const existingStaffEmail = await User.findOne({ email: cleanEmail });
    const existingBarangayEmail = await Barangay.findOne({ email: cleanEmail });

    if (existingStaffEmail || existingBarangayEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const pendingEmailRequest = await findPendingApprovalByEmail(cleanEmail);

    if (pendingEmailRequest?.status === 'pending') {
      return res.status(400).json({
        message: 'An account approval email is already pending for this address'
      });
    }

    if (cleanRole === 'barangay') {
      const existingBarangay = await Barangay.findOne({
        barangayName: cleanBarangay,
        archived: false
      });

      if (existingBarangay) {
        return res.status(400).json({
          message: 'An active account for this barangay already exists'
        });
      }

      const pendingBarangayRequest = await findPendingApprovalByBarangay(cleanBarangay);

      if (pendingBarangayRequest?.status === 'pending') {
        return res.status(400).json({
          message: 'An approval request for this barangay is already pending'
        });
      }
    }

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
    const approvalToken = crypto.randomBytes(32).toString('hex');
    const approvalTokenHash = hashApprovalToken(approvalToken);
    const approvalExpiresAt = new Date(Date.now() + ACCOUNT_APPROVAL_TTL_MS);

    const approvalRequest = await AccountApprovalRequest.create({
      role: cleanRole,
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      barangayName: cleanRole === 'barangay' ? cleanBarangay : null,
      phoneNumber: cleanPhoneNumber,
      hotline: cleanHotline,
      address: cleanAddress,
      approvalTokenHash,
      approvalExpiresAt,
      requestedBy: {
        adminId: req.session.userId || null,
        adminUsername: req.session.username || '',
        adminRole: req.session.role || 'admin'
      }
    });

    const approvalLink = buildApprovalLink(req, approvalToken);

    try {
      await sendAccountApprovalEmail({
        email: cleanEmail,
        approvalLink,
        role: cleanRole,
        username: cleanUsername,
        barangayName: cleanRole === 'barangay' ? cleanBarangay : '',
        requestedBy: req.session.username || 'Administrator'
      });
    } catch (mailErr) {
      await approvalRequest.deleteOne();
      console.error('Account approval email send failed:', {
        email: cleanEmail,
        role: cleanRole,
        message: mailErr.message,
        code: mailErr.code || '',
        status: mailErr.status || ''
      });
      return res.status(500).json({
        message:
          'Failed to send the approval email. Check deployed email provider settings (RESEND_API_KEY / EMAIL_FROM or EMAIL_USER / EMAIL_PASS).'
      });
    }

    await AdminLog.create({
      adminId: req.session.userId,
      adminUsername: req.session.username,
      action: 'request_create',
      targetUserId: approvalRequest._id,
      targetUsername: cleanUsername
    });

    await createAuditEvent({
      module: 'account',
      type: 'invite_requested',
      priority: 'normal',
      title: 'Account approval requested',
      message:
        cleanRole === 'barangay'
          ? `${req.session.username || 'Admin'} requested email approval for barangay account ${cleanUsername} (${cleanBarangay}).`
          : `${req.session.username || 'Admin'} requested email approval for ${
              cleanRole === 'accountant' ? 'Accountant' : 'DRRMO'
            } account ${cleanUsername}.`,
      actorId: req.session.userId || null,
      actorName: req.session.username || 'Admin',
      actorRole: req.session.role || 'admin',
      recipientRole: cleanRole,
      status: 'pending',
      referenceId: approvalRequest._id,
      referenceModel: 'AccountApprovalRequest',
      targetLabel: cleanUsername,
      phoneNumber: cleanPhoneNumber,
      metadata: {
        email: cleanEmail,
        barangayName: cleanRole === 'barangay' ? cleanBarangay : '',
        approvalExpiresAt
      }
    });

    res.status(202).json({
      message: 'Approval email sent. The account will be created after the recipient approves it.',
      pending: true,
      username: cleanUsername,
      email: cleanEmail,
      role: cleanRole,
      barangay: cleanRole === 'barangay' ? cleanBarangay : undefined,
      phoneNumber: cleanPhoneNumber,
      hotline: cleanHotline,
      address: cleanAddress,
      approvalExpiresAt
    });
  } catch (err) {
    console.error(err);

    if (err.code === 11000 && err.keyPattern?.barangayName) {
      return res.status(400).json({
        message: 'An active account for this barangay already exists'
      });
    }

    if (err.code === 11000 && err.keyPattern?.email) {
      return res.status(400).json({
        message: 'Email already exists'
      });
    }

    if (err.code === 11000 && err.keyPattern?.approvalTokenHash) {
      return res.status(500).json({
        message: 'Failed to generate approval token. Please try again.'
      });
    }

    res.status(500).json({ message: err.message });
  }
};

const approveAccountRequest = async (req, res) => {
  try {
    const token = String(req.params?.token || '').trim();

    if (!token) {
      return res
        .status(400)
        .send(
          renderApprovalPage({
            title: 'Invalid approval link',
            message: 'This account approval link is missing or invalid.'
          })
        );
    }

    const approvalRequest = await AccountApprovalRequest.findOne({
      approvalTokenHash: hashApprovalToken(token)
    });

    if (!approvalRequest) {
      return res
        .status(404)
        .send(
          renderApprovalPage({
            title: 'Approval link not found',
            message: 'This account approval link is invalid or has already been removed.'
          })
        );
    }

    if (approvalRequest.status === 'approved') {
      return res
        .status(200)
        .send(
          renderApprovalPage({
            title: 'Account already approved',
            message: 'This account request was already approved earlier. You can now log in using the approved account.',
            success: true
          })
        );
    }

    if (approvalRequest.status !== 'pending') {
      return res
        .status(400)
        .send(
          renderApprovalPage({
            title: 'Approval no longer available',
            message: `This account request is already marked as ${approvalRequest.status}.`
          })
        );
    }

    if (approvalRequest.approvalExpiresAt <= new Date()) {
      approvalRequest.status = 'expired';
      await approvalRequest.save();

      return res
        .status(400)
        .send(
          renderApprovalPage({
            title: 'Approval link expired',
            message: 'This approval link has expired. Ask the administrator to send a new account approval email.'
          })
        );
    }

    const [existingStaffEmail, existingBarangayEmail] = await Promise.all([
      User.findOne({ email: approvalRequest.email }),
      Barangay.findOne({ email: approvalRequest.email })
    ]);

    if (existingStaffEmail || existingBarangayEmail) {
      approvalRequest.status = 'cancelled';
      await approvalRequest.save();

      return res
        .status(409)
        .send(
          renderApprovalPage({
            title: 'Account already exists',
            message: 'An account using this email already exists, so this approval request can no longer be completed.'
          })
        );
    }

    if (approvalRequest.role === 'barangay') {
      const activeBarangay = await Barangay.findOne({
        barangayName: approvalRequest.barangayName,
        archived: false
      });

      if (activeBarangay) {
        approvalRequest.status = 'cancelled';
        await approvalRequest.save();

        return res
          .status(409)
          .send(
            renderApprovalPage({
              title: 'Barangay already assigned',
              message: 'An active account for this barangay already exists, so this approval request can no longer be completed.'
            })
          );
      }
    }

    const createdAccount = await createAccountFromApprovalRequest(approvalRequest);

    approvalRequest.status = 'approved';
    approvalRequest.approvedAt = new Date();
    approvalRequest.approvedByEmail = approvalRequest.email;
    approvalRequest.createdAccountId = createdAccount._id;
    approvalRequest.createdAccountModel =
      approvalRequest.role === 'barangay' ? 'Barangay' : 'UserStaff';
    await approvalRequest.save();

    await AdminLog.create({
      adminId: approvalRequest.requestedBy?.adminId || null,
      adminUsername: approvalRequest.requestedBy?.adminUsername || 'system',
      action: 'approve_create',
      targetUserId: createdAccount._id,
      targetUsername: createdAccount.username
    });

    await createAuditEvent({
      module: 'account',
      type: 'invite_approved',
      priority: 'normal',
      title: 'Account approval completed',
      message:
        approvalRequest.role === 'barangay'
          ? `${approvalRequest.email} approved barangay account ${createdAccount.username} (${approvalRequest.barangayName}).`
          : `${approvalRequest.email} approved ${
              approvalRequest.role === 'accountant' ? 'Accountant' : 'DRRMO'
            } account ${createdAccount.username}.`,
      actorId: null,
      actorName: approvalRequest.email,
      actorRole: 'external',
      recipientRole: approvalRequest.role,
      status: 'approved',
      referenceId: approvalRequest._id,
      referenceModel: 'AccountApprovalRequest',
      targetLabel: createdAccount.username,
      metadata: {
        email: approvalRequest.email,
        createdAccountId: createdAccount._id,
        createdAccountModel:
          approvalRequest.role === 'barangay' ? 'Barangay' : 'UserStaff',
        barangayName: approvalRequest.barangayName || ''
      }
    });

    return res
      .status(200)
      .send(
        renderApprovalPage({
          title: 'Account approved',
          message: 'Your account approval was successful. The administrator-created account is now active and ready to use.',
          success: true
        })
      );
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .send(
        renderApprovalPage({
          title: 'Approval failed',
          message: 'Something went wrong while approving this account. Please try again later or contact the administrator.'
        })
      );
  }
};

const approveAccountUpdateRequest = async (req, res) => {
  try {
    const token = String(req.params?.token || '').trim();

    if (!token) {
      return res
        .status(400)
        .send(
          renderApprovalPage({
            title: 'Invalid approval link',
            message: 'This account update approval link is missing or invalid.'
          })
        );
    }

    const approvalRequest = await AccountUpdateApprovalRequest.findOne({
      approvalTokenHash: hashApprovalToken(token)
    });

    if (!approvalRequest) {
      return res
        .status(404)
        .send(
          renderApprovalPage({
            title: 'Approval link not found',
            message: 'This account update approval link is invalid or has already been removed.'
          })
        );
    }

    if (approvalRequest.status === 'approved') {
      return res
        .status(200)
        .send(
          renderApprovalPage({
            title: 'Update already approved',
            message: 'This account update request was already approved earlier.',
            success: true
          })
        );
    }

    if (approvalRequest.status !== 'pending') {
      return res
        .status(400)
        .send(
          renderApprovalPage({
            title: 'Approval no longer available',
            message: `This account update request is already marked as ${approvalRequest.status}.`
          })
        );
    }

    if (approvalRequest.approvalExpiresAt <= new Date()) {
      approvalRequest.status = 'expired';
      await approvalRequest.save();

      return res
        .status(400)
        .send(
          renderApprovalPage({
            title: 'Approval link expired',
            message: 'This update approval link has expired. Ask the administrator to send a new account update approval email.'
          })
        );
    }

    const account =
      approvalRequest.accountModel === 'Barangay'
        ? await Barangay.findById(approvalRequest.accountId)
        : await User.findById(approvalRequest.accountId);

    if (!account) {
      approvalRequest.status = 'cancelled';
      await approvalRequest.save();

      return res
        .status(404)
        .send(
          renderApprovalPage({
            title: 'Account not found',
            message: 'This account is no longer available, so the pending update cannot be applied.'
          })
        );
    }

    account.username = approvalRequest.pendingUsername;
    account.phoneNumber = approvalRequest.pendingPhoneNumber;
    account.hotline = approvalRequest.pendingHotline;
    account.address = approvalRequest.pendingAddress;

    if (approvalRequest.pendingPasswordHash) {
      account.password = approvalRequest.pendingPasswordHash;
    }

    await account.save();

    approvalRequest.status = 'approved';
    approvalRequest.approvedAt = new Date();
    approvalRequest.approvedByEmail = approvalRequest.email;
    await approvalRequest.save();

    await AdminLog.create({
      adminId: approvalRequest.requestedBy?.adminId || null,
      adminUsername: approvalRequest.requestedBy?.adminUsername || 'system',
      action: 'approve_update',
      targetUserId: account._id,
      targetUsername: account.username
    });

    await createAuditEvent({
      module: 'account',
      type: 'update_approved',
      priority: 'normal',
      title: 'Account update approved',
      message:
        approvalRequest.role === 'barangay'
          ? `${approvalRequest.email} approved updates for barangay account ${account.username}.`
          : `${approvalRequest.email} approved updates for ${
              approvalRequest.role === 'accountant' ? 'Accountant' : 'DRRMO'
            } account ${account.username}.`,
      actorId: null,
      actorName: approvalRequest.email,
      actorRole: 'external',
      recipientRole: approvalRequest.role,
      status: 'approved',
      referenceId: approvalRequest._id,
      referenceModel: 'AccountUpdateApprovalRequest',
      targetLabel: account.username,
      metadata: {
        accountId: account._id,
        accountModel: approvalRequest.accountModel,
        email: approvalRequest.email
      }
    });

    return res
      .status(200)
      .send(
        renderApprovalPage({
          title: 'Account update approved',
          message: 'Your account update was approved successfully. The administrator-requested changes are now active.',
          success: true
        })
      );
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .send(
        renderApprovalPage({
          title: 'Approval failed',
          message: 'Something went wrong while approving this account update. Please try again later or contact the administrator.'
        })
      );
  }
};


/* LOGIN */
const login = async (req, res) => {

  try {

    const email = sanitizeEmail(req.body?.email);
    const password = sanitizePassword(req.body?.password);

    let account = await UserStaff.findOne({ email });
    let role = account ? account.role : null;
    let barangayName = null;

    if (!account) {

      account = await Barangay.findOne({ email });

      if (account) {
        role = 'barangay';
        barangayName = account.barangayName;
      }

    }

    if (!account)
      return res.status(401).json({ message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, account.password);

    if (!match)
      return res.status(401).json({ message: 'Invalid email or password' });

console.log("LOGIN ACCOUNT:", {
  id: account._id,
  email: account.email,
  username: account.username,
  role
});

req.session.userId = account._id;
req.session.role = role;
req.session.isAuthenticated = true;
req.session.username = account.username;
req.session.barangayName = barangayName || account.barangayName || "";
req.session.themePreference = sanitizeThemePreference(account.themePreference);

console.log("SESSION BEFORE SAVE:", req.session);


   req.session.save(async (err) => {
  if (err) {
    return res.status(500).json({ message: "Session save failed" });
  }

  await TimeLog.create({
    user: account._id,
    userModel: role === 'barangay' ? 'Barangay' : 'UserStaff',
    username: account.username,
    role,
    barangay: barangayName,
    timeIn: new Date(),
    timeOut: null
  });

  res.json({
    userId: account._id,
    username: account.username,
    email: account.email,
    role,
    verified: account.verified,
    themePreference: sanitizeThemePreference(account.themePreference),
    ...(role === 'barangay' && { barangay: barangayName })
  });
});

  } catch (err) {

    if (err.code === 11000 && err.keyPattern?.accountId) {
      return res.status(400).json({
        message: 'An account update approval email is already pending for this account'
      });
    }

    res.status(500).json({ message: err.message });

  }
};


/* LOGOUT */
const logout = async (req, res) => {

  try {

    if (!req.session.userId) {
      return res.json({ message: 'No active session' });
    }

    await TimeLog.findOneAndUpdate(
      { user: req.session.userId, timeOut: null },
      { timeOut: new Date() },
      { sort: { timeIn: -1 } }
    );

    req.session.destroy(() => {
      res.json({ message: 'Logged out successfully' });
    });

  } catch (err) {

    res.status(500).json({ message: err.message });

  }
};


/* GET ALL ACCOUNTS */
const getAllAccounts = async (req, res) => {

  try {

    const users = await User.find({ archived: false }).select('-password');
    const barangays = await Barangay.find().select('-password');

    const all = [

      ...users.map(u => ({
        ...u.toObject(),
        type: 'user'
      })),

      ...barangays.map(b => ({
        ...b.toObject(),
        role: 'barangay',
        type: 'barangay'
      }))

    ];

    res.json(all);

  } catch (err) {

    res.status(500).json({ message: err.message });

  }
};


/* UPDATE ACCOUNT */
const updateAccount = async (req, res) => {

  try {

    const targetId = req.params.id || req.session.userId;

    let account =
      await Barangay.findById(targetId) ||
      await User.findById(targetId);

    if (!account)
      return res.status(404).json({ message: 'Account not found' });

    const { username, phoneNumber, hotline, address, password } = req.body;
    const cleanUsername = username !== undefined ? sanitizeUsername(username) : undefined;
    const cleanPhoneNumber = phoneNumber !== undefined ? sanitizePhoneNumber(phoneNumber) : undefined;
    const cleanHotline = hotline !== undefined ? sanitizeHotline(hotline) : undefined;
    const cleanAddress = address !== undefined ? sanitizeAddress(address) : undefined;
    const cleanPassword = password ? sanitizePassword(password) : '';

    if (!cleanUsername || !cleanPhoneNumber || !cleanAddress) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const pendingRequest = await findPendingUpdateApprovalByAccount(account._id);

    if (pendingRequest?.status === 'pending') {
      return res.status(400).json({
        message: 'An account update approval email is already pending for this account'
      });
    }

    const hasFieldChanges =
      cleanUsername !== account.username ||
      cleanPhoneNumber !== (account.phoneNumber || '') ||
      cleanHotline !== (account.hotline || '') ||
      cleanAddress !== (account.address || '');

    if (!hasFieldChanges && !cleanPassword) {
      return res.status(400).json({ message: 'No changes detected' });
    }

    if (cleanPassword) {

      const same = await bcrypt.compare(cleanPassword, account.password);

      if (same)
        return res.status(400).json({ message: 'Password must be different' });

    }

    const pendingPasswordHash = cleanPassword
      ? await bcrypt.hash(cleanPassword, 10)
      : '';
    const approvalToken = crypto.randomBytes(32).toString('hex');
    const approvalTokenHash = hashApprovalToken(approvalToken);
    const approvalExpiresAt = new Date(Date.now() + ACCOUNT_UPDATE_TTL_MS);
    const changeSummary = buildUpdateSummary({
      account,
      username: cleanUsername,
      phoneNumber: cleanPhoneNumber,
      hotline: cleanHotline,
      address: cleanAddress,
      hasPasswordChange: Boolean(cleanPassword)
    });

    const updateRequest = await AccountUpdateApprovalRequest.create({
      accountId: account._id,
      accountModel: account instanceof Barangay ? 'Barangay' : 'UserStaff',
      role: account instanceof Barangay ? 'barangay' : account.role,
      email: account.email,
      currentUsername: account.username,
      pendingUsername: cleanUsername,
      pendingPhoneNumber: cleanPhoneNumber,
      pendingHotline: cleanHotline,
      pendingAddress: cleanAddress,
      pendingPasswordHash,
      approvalTokenHash,
      approvalExpiresAt,
      requestedBy: {
        adminId: req.session.userId || null,
        adminUsername: req.session.username || '',
        adminRole: req.session.role || 'admin'
      }
    });

    try {
      await sendAccountUpdateApprovalEmail({
        email: account.email,
        approvalLink: buildUpdateApprovalLink(req, approvalToken),
        role: account instanceof Barangay ? 'barangay' : account.role,
        currentUsername: account.username,
        requestedBy: req.session.username || 'Administrator',
        changeSummary
      });
    } catch (mailErr) {
      await updateRequest.deleteOne();
      console.error('Account update approval email send failed:', {
        email: account.email,
        role: account instanceof Barangay ? 'barangay' : account.role,
        message: mailErr.message,
        code: mailErr.code || '',
        status: mailErr.status || ''
      });
      return res.status(500).json({
        message:
          'Failed to send the approval email. Check deployed email provider settings (RESEND_API_KEY / EMAIL_FROM or EMAIL_USER / EMAIL_PASS).'
      });
    }

    await AdminLog.create({
      adminId: req.session.userId,
      adminUsername: req.session.username,
      action: "request_update",
      targetUserId: updateRequest._id,
      targetUsername: account.username
    });

    await createAuditEvent({
      module: 'account',
      type: 'update_requested',
      priority: 'normal',
      title: 'Account update requested',
      message:
        account instanceof Barangay
          ? `${req.session.username || 'Admin'} requested email approval to update barangay account ${account.username}.`
          : `${req.session.username || 'Admin'} requested email approval to update ${
              account.role === 'accountant' ? 'Accountant' : 'DRRMO'
            } account ${account.username}.`,
      actorId: req.session.userId || null,
      actorName: req.session.username || 'Admin',
      actorRole: req.session.role || 'admin',
      recipientRole: account instanceof Barangay ? 'barangay' : account.role,
      status: 'pending',
      referenceId: updateRequest._id,
      referenceModel: 'AccountUpdateApprovalRequest',
      targetLabel: account.username,
      metadata: {
        email: account.email,
        approvalExpiresAt,
        changeSummary
      }
    });

    res.status(202).json({
      message: 'Approval email sent. The account will be updated after the recipient approves it.',
      pending: true,
      approvalExpiresAt
    });

  } catch (err) {

    res.status(500).json({ message: err.message });

  }
};


/* ARCHIVE ACCOUNT */
const archiveAccount = async (req, res) => {

  try {

    const accountId = req.params.id;

    let account = await User.findById(accountId);
    let accountType = "User";
    let role = account ? account.role : null;

    if (!account) {

      account = await Barangay.findById(accountId);
      accountType = "Barangay";
      role = "barangay";

    }

    if (!account)
      return res.status(404).json({ message: "Account not found" });

    await ArchivedAccount.create({

      originalId: account._id,
      accountType,
      role,
      username: account.username,
      email: account.email,
      password: account.password,
      barangayName: account.barangayName,
      themePreference: account.themePreference || 'dark',
      phoneNumber: account.phoneNumber,
      hotline: account.hotline,
      address: account.address

    });

    await account.deleteOne();

    await AdminLog.create({
      adminId: req.session.userId,
      adminUsername: req.session.username,
      action: "archive",
      targetUserId: account._id,
      targetUsername: account.username
    });

    res.json({ message: "Account archived successfully" });

  } catch (err) {

    console.error(err);
    res.status(500).json({ message: err.message });

  }

};


/* RESTORE ACCOUNT */
const restoreAccount = async (req, res) => {

  try {

    const archiveId = req.params.id;

    const archived = await ArchivedAccount.findById(archiveId);

    if (!archived)
      return res.status(404).json({ message: "Archived account not found" });

    let restored;

    if (archived.accountType === "User") {

      restored = await User.create({

        username: archived.username,
        email: archived.email,
        password: archived.password,
        phoneNumber: archived.phoneNumber,
        hotline: archived.hotline,
        address: archived.address,
        themePreference: archived.themePreference || 'dark',
        role: archived.role   // FIXED HERE

      });

    } else {

      restored = await Barangay.create({

        username: archived.username,
        email: archived.email,
        password: archived.password,
        phoneNumber: archived.phoneNumber,
        hotline: archived.hotline,
        address: archived.address,
        barangayName: archived.barangayName,
        themePreference: archived.themePreference || 'dark',
        verified: true

      });

    }

    await archived.deleteOne();

    await AdminLog.create({

      adminId: req.session.userId,
      adminUsername: req.session.username,
      action: "restore",
      targetUserId: restored._id,
      targetUsername: restored.username

    });

    res.json({
      message: "Account restored successfully",
      restored
    });

  } catch (err) {

    console.error(err);
    res.status(500).json({ message: err.message });

  }

};


/* GET ARCHIVED ACCOUNTS */
const getArchivedAccounts = async (req, res) => {

  try {

    const archived = await ArchivedAccount.find();

    res.json(archived);

  } catch (err) {

    res.status(500).json({ message: err.message });

  }
};

const deleteArchivedAccount = async (req, res) => {
  try {
    const archiveId = req.params.id;
    const archived = await ArchivedAccount.findById(archiveId);

    if (!archived) {
      return res.status(404).json({ message: 'Archived account not found' });
    }

    await archived.deleteOne();

    await AdminLog.create({
      adminId: req.session.userId,
      adminUsername: req.session.username,
      action: 'delete_archived',
      targetUserId: archived.originalId,
      targetUsername: archived.username
    });

    await createAuditEvent({
      module: 'account',
      type: 'archived_delete',
      priority: 'normal',
      title: 'Archived account deleted',
      message: `${req.session.username || 'Admin'} permanently deleted archived account ${archived.username}.`,
      actorId: req.session.userId || null,
      actorName: req.session.username || 'Admin',
      actorRole: req.session.role || 'admin',
      recipientRole: archived.role || '',
      status: 'deleted',
      referenceId: archived._id,
      referenceModel: 'ArchivedAccount',
      targetLabel: archived.username,
      metadata: {
        email: archived.email || '',
        role: archived.role || ''
      }
    });

    res.json({ message: 'Archived account deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};


/* ADMIN LOGS */
const getAdminLogs = async (req, res) => {

  try {

    const logs = await AdminLog
      .find()
      .sort({ timestamp: -1 })
      .limit(100);

    res.json(logs);

  } catch (err) {

    res.status(500).json({ message: err.message });

  }
};

const getAvailableBarangays = async (req, res) => {
  try {
    const BARANGAY_OPTIONS = [
      "Calabasa",
  "Don Mariano Marcos",
  "Dampulan",
  "Hilera",
  "Imbunia",
  "Lambakin",
  "Langla",
  "Magsalisi",
  "Malabon Kaingin",
  "Marawa",
  "Niyugan",
  "Pamacpacan",
  "Pakol",
  "Pinanggaan",
  "Putlod",
  "San Jose",
  "San Josef (Nabao)",
  "San Pablo",
  "San Roque",
  "San Vicente",
  "Santa Rita",
  "Sapang",
  "Santo Tomas North",
  "Santo Tomas South",
  "Ulanin Pitak"
    ];

    const [existingBarangays, pendingBarangayApprovals] = await Promise.all([
      Barangay.find(
        { archived: false },
        'barangayName'
      ).lean(),
      AccountApprovalRequest.find(
        {
          role: 'barangay',
          status: 'pending',
          approvalExpiresAt: { $gt: new Date() }
        },
        'barangayName'
      ).lean()
    ]);

    const usedBarangays = [
      ...existingBarangays.map(item => item.barangayName),
      ...pendingBarangayApprovals
        .map(item => item.barangayName)
        .filter(Boolean)
    ];

    const availableBarangays = BARANGAY_OPTIONS.filter(
      name => !usedBarangays.includes(name)
    );

    res.json({
      all: BARANGAY_OPTIONS,
      used: usedBarangays,
      available: availableBarangays
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const updateThemePreference = async (req, res) => {
  try {
    const role = String(req.session?.role || '').toLowerCase();
    const userId = req.session?.userId;

    if (!userId || !role) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const themePreference = sanitizeThemePreference(req.body?.themePreference);
    const Model = role === 'barangay' ? Barangay : UserStaff;

    const account = await Model.findByIdAndUpdate(
      userId,
      { themePreference },
      { new: true, fields: 'themePreference username role barangayName' }
    );

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    req.session.themePreference = themePreference;

    return res.json({
      message: 'Theme preference updated',
      themePreference,
      role,
      username: account.username,
      barangayName: account.barangayName || ''
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};


module.exports = {

  initAdmin,
  register,
  login,
  logout,
  getAllAccounts,
  updateAccount,
  archiveAccount,
  restoreAccount,
  getArchivedAccounts,
  deleteArchivedAccount,
  getAdminLogs,
  getAvailableBarangays,
  approveAccountRequest,
  approveAccountUpdateRequest,
  updateThemePreference

};
