const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const emailService = require('../utils/emailService');

const bundleDownloads = {
  // Free Family - files live under public/pdfs/families/
  'free-family': [
    'families/Konfydence-Family-Tech-Contract.pdf',
    'families/Family_SSK_Rules.pdf'
  ],
  // Free Classroom - files at public/pdfs root
  'free-classroom': [
    'School_Lesson_Plan.pdf',
    'School_Parent HACK Guide.pdf',
    'SchoolClassroom_Pause_Posters.pdf',
    'School_Curriculum Alignment Map.pdf',
  ],
  // Ambassador pack - files under public/pdfs/Ambassador/
  'ambassador': ['Ambassador/KonfydenceAmbassador.pdf', 'Ambassador/KonfydenceAmbassadorAgreement.pdf'],
  // Advanced Educator Toolkit - files at public/pdfs root
  'advanced-educator': [
    'School_Lesson_Plan.pdf',
    'School Implementation Roadmap.pdf',
    'Konfydence_For_Schools.pdf',
    'Konfydence_For_Universities.pdf'
  ],
  // Compliance & Audit Pack - files under corporate/ and implementation/
  'compliance-audit': [
    'corporate/NIS2_ISO_Alignment.pdf',
    'implementation/BehavioralEvidenceTemplate.pdf',
    'corporate/PilotProofofConceptAgreement.pdf'
  ],
};

const normalize = (s) => String(s || '').toLowerCase().replace(/["'\s\-_\.]/g, '');

async function listPdfFiles() {
  // PDFs live in the frontend web/public/pdfs folder
  const publicPdfsDir = path.join(process.cwd(), '..', 'web', 'public', 'pdfs');
  const files = [];
  async function walk(dir, base) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (entry.isDirectory()) await walk(full, base);
      else if (entry.isFile()) files.push(rel);
    }
  }
  try {
    await walk(publicPdfsDir, publicPdfsDir);
  } catch (e) {
    return [];
  }
  return files;
}

router.post('/email-resources', async (req, res) => {
  try {
    const { bundleKey, email } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!bundleKey || !bundleDownloads[bundleKey]) return res.status(400).json({ success: false, message: 'Invalid bundle' });
    if (!email || !emailRegex.test(email)) return res.status(400).json({ success: false, message: 'Invalid email' });

    const index = await listPdfFiles();
    const candidates = bundleDownloads[bundleKey];
    const found = [];
    for (const cand of candidates) {
      const candNorm = normalize(cand);
      const match = index.find((f) => normalize(f).includes(candNorm) || candNorm.includes(normalize(f)));
      if (match) found.push(match);
    }

    if (found.length === 0) {
      return res.status(200).json({ success: false, message: 'No files found for this bundle' });
    }

    // Build absolute URLs using FRONTEND_URL or NEXT_PUBLIC_FRONTEND_URL, fallback to localhost:3000 for dev
    const frontendUrl = (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const linksHtml = found.map((f) => {
      const url = `${frontendUrl}/pdfs/${encodeURI(f)}`;
      const name = f.split('/').pop();
      return `<li><a href="${url}">${name}</a></li>`;
    }).join('');

    // Simple email: plain HTML with list and attachments (no header/logo)
    const cleanDisplayName = (filename) => {
      // remove leading numbers and separators, replace underscores/dashes with spaces
      const base = path.basename(filename);
      const withoutPrefix = base.replace(/^\s*\d+[\.\-\s_]*/,'');
      return withoutPrefix.replace(/[_\-]+/g, ' ');
    };

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; color:#222;">
          <p>Hello,</p>
          <p>As requested, please find the resources from Konfydence attached to this email for your convenience.</p>
          <p>Requested resources:</p>
          <ul>
            ${found.map((f) => `<li>${cleanDisplayName(f)}</li>`).join('')}
          </ul>
          <p>If you have any questions or need further assistance, reply to this email and we'll be happy to help.</p>
          <p>Kind regards,<br/>The Konfydence Team</p>
        </body>
      </html>
    `;

    // Validate that email service is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.MAIL_FROM) {
      console.error('Email service not configured on backend.');
      return res.status(500).json({ success: false, message: 'Email service not configured on backend' });
    }

    // Prepare attachments for existing files. Allow overriding PDFs directory via env.
    const attachments = [];
    const publicPdfsDir = process.env.PDFS_DIR
      ? path.resolve(process.env.PDFS_DIR)
      : path.join(process.cwd(), '..', 'web', 'public', 'pdfs');

    console.log(`email-resources: preparing attachments for bundleKey=${bundleKey}, email=${email}`);
    console.log('email-resources: publicPdfsDir =', publicPdfsDir);
    console.log('email-resources: found files from index =', found);

    for (const f of found) {
      const absPath = path.join(publicPdfsDir, f);
      if (fs.existsSync(absPath)) {
        attachments.push({ filename: path.basename(f), path: absPath });
        console.log('email-resources: attaching file:', { file: f, absPath });
      } else {
        console.warn('email-resources: Attachment file missing on disk, skipping:', { file: f, absPath });
      }
    }

    console.log('email-resources: final attachments list =', attachments.map(a => a.path));

    const transporter = emailService.createTransporter();
    const mailOptions = {
      from: `"Konfydence" <${process.env.MAIL_FROM}>`,
      to: email,
      subject: 'Your requested Konfydence resources',
      html,
      text: `Please find your requested resources: ${found.map((f) => `${frontendUrl}/pdfs/${f}`).join(', ')}`,
      attachments: attachments.length ? attachments : undefined,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('Sent resources email:', info.messageId, 'to', email);
    return res.status(200).json({ success: true, messageId: info.messageId, files: found });
  } catch (err) {
    console.error('Error in email-resources route:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to send email' });
  }
});

module.exports = router;

