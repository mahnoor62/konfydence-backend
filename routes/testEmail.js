const express = require('express');
const { createTransporter } = require('../utils/emailService');

const router = express.Router();

// Test email endpoint (for debugging)
router.post('/test-email', async (req, res) => {
  try {
    const { to } = req.body;
    
    if (!to) {
      return res.status(400).json({ error: 'Email address (to) is required' });
    }

    // Check if email service is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(500).json({
        error: 'Email service not configured',
        details: {
          SMTP_USER: process.env.SMTP_USER ? 'Set' : 'Missing',
          SMTP_PASS: process.env.SMTP_PASS ? 'Set' : 'Missing',
          SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com (default)',
          SMTP_PORT: process.env.SMTP_PORT || '587 (default)'
        }
      });
    }

    const transporter = createTransporter();
    
    // Test email
    const testEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test Email</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #F5F8FB; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; padding: 30px;">
    <h2 style="color: #063C5E;">Test Email from Konfydence</h2>
    <p>This is a test email to verify that email service is working correctly.</p>
    <p style="color: #666666; font-size: 14px;">If you received this email, your email service is configured properly!</p>
    <p style="color: #666666; font-size: 14px;">Time sent: ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
    `;

    const info = await transporter.sendMail({
      from: `"Konfydence" <${process.env.SMTP_USER}>`,
      to: to,
      subject: 'Test Email - Konfydence Email Service',
      html: testEmailHtml,
      text: 'This is a test email to verify that email service is working correctly.'
    });

    res.json({
      success: true,
      message: 'Test email sent successfully',
      details: {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response
      }
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      error: 'Failed to send test email',
      details: {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode
      }
    });
  }
});

// Check email configuration
router.get('/email-config', async (req, res) => {
  res.json({
    configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    details: {
      SMTP_USER: process.env.SMTP_USER ? 'Set' : 'Missing',
      SMTP_PASS: process.env.SMTP_PASS ? 'Set' : 'Missing',
      SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com (default)',
      SMTP_PORT: process.env.SMTP_PORT || '587 (default)',
      FRONTEND_URL: process.env.FRONTEND_URL || 'Not set'
    }
  });
});

module.exports = router;

