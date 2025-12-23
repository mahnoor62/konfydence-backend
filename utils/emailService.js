const nodemailer = require('nodemailer');

// Email configuration - update these in your .env file
const createTransporter = () => {
  const config = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Add connection timeout and greeting timeout
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000, // 10 seconds
    // Add debug option for troubleshooting (only in development)
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development'
  };

  console.log('Creating SMTP transporter:', {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.auth.user ? `${config.auth.user.substring(0, 3)}***` : 'Not set',
    hasPassword: !!config.auth.pass
  });

  return nodemailer.createTransport(config);
};

// Website color theme
const colors = {
  primary: '#063C5E',      // Dark blue
  secondary: '#0B7897',    // Teal
  accent: '#FFD700',       // Gold
  background: '#F5F8FB',   // Light blue
  text: '#333333',          // Dark gray
  white: '#FFFFFF',
};

const getStatusColor = (status) => {
  const statusColors = {
    pending: '#FFA500',      // Orange
    reviewing: '#0B7897',    // Teal
    approved: '#28A745',     // Green
    rejected: '#DC3545',     // Red
    completed: '#28A745',    // Green
  };
  return statusColors[status] || colors.primary;
};

const getStatusLabel = (status) => {
  const labels = {
    pending: 'Pending',
    reviewing: 'Under Review',
    approved: 'Approved',
    rejected: 'Rejected',
    completed: 'Completed',
  };
  return labels[status] || status;
};

const createEmailTemplate = (request, status, adminNotes) => {
  const statusColor = getStatusColor(status);
  const statusLabel = getStatusLabel(status);
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Custom Package Request Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: ${colors.background};">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${colors.background}; padding: 20px;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: ${colors.white}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: ${colors.white}; font-size: 28px; font-weight: 700;">Konfydence</h1>
              <p style="margin: 5px 0 0 0; color: ${colors.accent}; font-size: 14px; font-weight: 500;">Safer Digital Decisions</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: ${colors.primary}; font-size: 24px; font-weight: 700;">Custom Package Request Update</h2>
              
              <p style="margin: 0 0 20px 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                Dear ${request.contactName},
              </p>
              
              <p style="margin: 0 0 20px 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                We wanted to inform you about an update regarding your custom package request for <strong>${request.organizationName}</strong>.
              </p>
              
              <!-- Status Badge -->
              <table role="presentation" style="width: 100%; margin: 30px 0; border-collapse: collapse;">
                <tr>
                  <td style="background-color: ${statusColor}; color: ${colors.white}; padding: 12px 20px; border-radius: 6px; text-align: center;">
                    <strong style="font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">${statusLabel}</strong>
                  </td>
                </tr>
              </table>
              
              <!-- Request Details -->
              <div style="background-color: ${colors.background}; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">Request Details</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Organization:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${request.organizationName}</td>
                  </tr>
                  ${request.requestedModifications?.seatLimit ? `
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Requested Seats:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${request.requestedModifications.seatLimit}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              
              ${adminNotes ? `
              <!-- Admin Notes -->
              <div style="background-color: #FFF9E6; border-left: 4px solid ${colors.accent}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; color: ${colors.primary}; font-size: 16px; font-weight: 600;">Additional Information</h3>
                <p style="margin: 0; color: ${colors.text}; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${adminNotes}</p>
              </div>
              ` : ''}
              
              <!-- Next Steps -->
              <div style="margin: 30px 0;">
                <p style="margin: 0 0 15px 0; color: ${colors.text}; font-size: 16px; font-weight: 600;">What's Next?</p>
                ${status === 'approved' ? `
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  Your request has been approved! Our team will contact you shortly to discuss the next steps and finalize your custom package.
                </p>
                ` : status === 'rejected' ? `
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  We're sorry, but your request could not be approved at this time. If you have any questions, please don't hesitate to contact us.
                </p>
                ` : status === 'reviewing' ? `
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  Your request is currently under review. We'll keep you updated as we process your request.
                </p>
                ` : status === 'completed' ? `
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  Your custom package has been created successfully! You can now access it through your organization dashboard.
                </p>
                ` : `
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  We'll keep you updated on the progress of your request.
                </p>
                `}
              </div>
              
              <!-- Contact Info -->
              <div style="border-top: 2px solid ${colors.background}; padding-top: 20px; margin-top: 30px;">
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  If you have any questions or need further assistance, please don't hesitate to contact us.
                </p>
                <p style="margin: 0; color: ${colors.secondary}; font-size: 14px; font-weight: 600;">
                  Best regards,<br>
                  The Konfydence Team
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: ${colors.primary}; padding: 20px 30px; text-align: center;">
              <p style="margin: 0; color: ${colors.white}; font-size: 12px;">
                © ${new Date().getFullYear()} Konfydence. All rights reserved.
              </p>
              <p style="margin: 5px 0 0 0; color: ${colors.accent}; font-size: 12px;">
                Safer Digital Decisions
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const sendStatusUpdateEmail = async (request, newStatus, adminNotes) => {
  try {
    // Check if email service is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('Email service not configured. Skipping email send.');
      return { success: false, message: 'Email service not configured' };
    }

    const transporter = createTransporter();
    const emailHtml = createEmailTemplate(request, newStatus, adminNotes);

    const mailOptions = {
      from: `"Konfydence" <${process.env.SMTP_USER}>`,
      to: request.contactEmail,
      subject: `Custom Package Request Update - ${getStatusLabel(newStatus)}`,
      html: emailHtml,
      text: `
Dear ${request.contactName},

We wanted to inform you about an update regarding your custom package request for ${request.organizationName}.

Status: ${getStatusLabel(newStatus)}

Request Details:
- Organization: ${request.organizationName}
${request.requestedModifications?.seatLimit ? `- Requested Seats: ${request.requestedModifications.seatLimit}` : ''}

${adminNotes ? `\nAdditional Information:\n${adminNotes}\n` : ''}

If you have any questions, please don't hesitate to contact us.

Best regards,
The Konfydence Team
      `.trim(),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

const createCustomPackageEmailTemplate = (request, customPackage) => {
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getBillingTypeLabel = (type) => {
    const labels = {
      'one_time': 'One Time',
      'subscription': 'Subscription',
      'per_seat': 'Per Seat'
    };
    return labels[type] || type;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Custom Package Created</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: ${colors.background};">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${colors.background}; padding: 20px;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: ${colors.white}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: ${colors.white}; font-size: 28px; font-weight: 700;">Konfydence</h1>
              <p style="margin: 5px 0 0 0; color: ${colors.accent}; font-size: 14px; font-weight: 500;">Safer Digital Decisions</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: ${colors.primary}; font-size: 24px; font-weight: 700;">Your Custom Package Has Been Created!</h2>
              
              <p style="margin: 0 0 20px 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                Dear ${request.contactName},
              </p>
              
              <p style="margin: 0 0 20px 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                Great news! Your custom package for <strong>${request.organizationName}</strong> has been successfully created and is now active.
              </p>
              
              <!-- Success Badge -->
              <table role="presentation" style="width: 100%; margin: 30px 0; border-collapse: collapse;">
                <tr>
                  <td style="background-color: #28A745; color: ${colors.white}; padding: 12px 20px; border-radius: 6px; text-align: center;">
                    <strong style="font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">Package Active</strong>
                  </td>
                </tr>
              </table>
              
              <!-- Package Details -->
              <div style="background-color: ${colors.background}; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">Package Details</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Package Name:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${customPackage.name || request.basePackageId?.name || 'Custom Package'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Organization:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${request.organizationName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Seat Limit:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${customPackage.seatLimit || request.requestedModifications?.seatLimit || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Contract Start Date:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${formatDate(customPackage.contract?.startDate)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Contract End Date:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${formatDate(customPackage.contract?.endDate)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Contract Status:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">
                      <span style="background-color: #28A745; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                        ${customPackage.contract?.status?.toUpperCase() || 'ACTIVE'}
                      </span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- Pricing Details -->
              <div style="background-color: #FFF9E6; border-left: 4px solid ${colors.accent}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 15px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">Pricing Information</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Amount:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.primary}; font-size: 18px; font-weight: 700;">
                      ${(customPackage.contractPricing?.currency || 'EUR') === 'EUR' ? '€' : (customPackage.contractPricing?.currency || 'EUR')}${customPackage.contractPricing?.amount || 0}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Billing Type:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${getBillingTypeLabel(customPackage.contractPricing?.billingType)}</td>
                  </tr>
                  ${customPackage.contractPricing?.notes ? `
                  <tr>
                    <td colspan="2" style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">
                      <strong>Notes:</strong> ${customPackage.contractPricing.notes}
                    </td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              
              ${customPackage.addedCardIds && customPackage.addedCardIds.length > 0 ? `
              <!-- Added Cards -->
              <div style="background-color: ${colors.background}; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">Additional Cards (${customPackage.addedCardIds.length})</h3>
                <ul style="margin: 0; padding-left: 20px; color: ${colors.text}; font-size: 14px; line-height: 1.8;">
                  ${customPackage.addedCardIds.map(card => `
                    <li>${card.title || card.name || 'Card'}</li>
                  `).join('')}
                </ul>
              </div>
              ` : ''}
              
              <!-- Next Steps -->
              <div style="margin: 30px 0;">
                <p style="margin: 0 0 15px 0; color: ${colors.text}; font-size: 16px; font-weight: 600;">What's Next?</p>
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  Your custom package is now active and ready to use. Please visit your organization dashboard to view and manage your package.
                </p>
                <!-- Visit Dashboard button commented out temporarily -->
                <!-- <div style="background-color: ${colors.secondary}; padding: 15px; border-radius: 6px; margin: 15px 0; text-align: center;">
                  <a href="${process.env.FRONTEND_URL}/dashboard/institute" style="display: inline-block; background-color: ${colors.white}; color: ${colors.secondary}; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                    Visit Dashboard
                  </a>
                </div> -->
                <p style="margin: 10px 0 0 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  Our team will be in touch shortly to help you get started and answer any questions you may have.
                </p>
              </div>
              
              <!-- Contact Info -->
              <div style="border-top: 2px solid ${colors.background}; padding-top: 20px; margin-top: 30px;">
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  If you have any questions or need further assistance, please don't hesitate to contact us.
                </p>
                <p style="margin: 0; color: ${colors.secondary}; font-size: 14px; font-weight: 600;">
                  Best regards,<br>
                  The Konfydence Team
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: ${colors.primary}; padding: 20px 30px; text-align: center;">
              <p style="margin: 0; color: ${colors.white}; font-size: 12px;">
                © ${new Date().getFullYear()} Konfydence. All rights reserved.
              </p>
              <p style="margin: 5px 0 0 0; color: ${colors.accent}; font-size: 12px;">
                Safer Digital Decisions
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const sendCustomPackageCreatedEmail = async (request, customPackage) => {
  try {
    // Check if email service is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('⚠️ Email service not configured. Skipping email send.');
      console.warn('⚠️ SMTP_USER:', process.env.SMTP_USER ? 'Set' : 'Missing');
      console.warn('⚠️ SMTP_PASS:', process.env.SMTP_PASS ? 'Set' : 'Missing');
      return { success: false, message: 'Email service not configured' };
    }

    // Validate request has contact email
    if (!request.contactEmail) {
      console.error('❌ Request does not have contactEmail:', request);
      return { success: false, message: 'Request contactEmail is missing' };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.contactEmail)) {
      console.error('❌ Invalid email format:', request.contactEmail);
      return { success: false, message: 'Invalid email format' };
    }

    console.log('📧 Preparing to send custom package creation email:', {
      to: request.contactEmail,
      contactName: request.contactName,
      organizationName: request.organizationName,
      packageName: customPackage.name || 'Custom Package'
    });

    const transporter = createTransporter();
    const emailHtml = createCustomPackageEmailTemplate(request, customPackage);

    const mailOptions = {
      from: `"Konfydence" <${process.env.SMTP_USER}>`,
      to: request.contactEmail,
      subject: `Your Custom Package Has Been Created - ${request.organizationName}`,
      html: emailHtml,
      text: `
Dear ${request.contactName},

Great news! Your custom package for ${request.organizationName} has been successfully created and is now active.

Package Details:
- Package Name: ${customPackage.name || 'Custom Package'}
- Organization: ${request.organizationName}
- Seat Limit: ${customPackage.seatLimit || request.requestedModifications?.seatLimit || 'N/A'}
- Contract Start Date: ${customPackage.contract?.startDate ? new Date(customPackage.contract.startDate).toLocaleDateString() : 'N/A'}
- Contract End Date: ${customPackage.contract?.endDate ? new Date(customPackage.contract.endDate).toLocaleDateString() : 'N/A'}
- Contract Status: ${customPackage.contract?.status || 'Active'}

Pricing Information:
- Amount: ${(customPackage.contractPricing?.currency || 'EUR') === 'EUR' ? '€' : (customPackage.contractPricing?.currency || 'EUR')}${customPackage.contractPricing?.amount || 0}
- Billing Type: ${customPackage.contractPricing?.billingType || 'N/A'}

Your custom package is now active and ready to use. Please visit your organization dashboard to view and manage your package.

<!-- Dashboard Link commented out temporarily -->
<!-- Dashboard Link: ${process.env.FRONTEND_URL}/dashboard/institute -->

Our team will be in touch shortly to help you get started.

If you have any questions, please don't hesitate to contact us.

Best regards,
The Konfydence Team
      `.trim(),
    };

    console.log('📧 Sending email via SMTP:', {
      from: process.env.SMTP_USER,
      to: request.contactEmail,
      host: process.env.SMTP_HOST || 'smtp.gmail.com'
    });

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Custom package creation email sent successfully:', {
      messageId: info.messageId,
      to: request.contactEmail,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response
    });

    // Log warning if email was rejected
    if (info.rejected && info.rejected.length > 0) {
      console.warn('⚠️ Email was rejected by SMTP server:', {
        rejected: info.rejected,
        messageId: info.messageId,
        to: request.contactEmail
      });
    }

    // Log success note
    if (info.accepted && info.accepted.length > 0) {
      console.log('✅ Email accepted by SMTP server. Note: Email may take a few minutes to arrive. Please check spam folder if not received.');
    }

    return { 
      success: true, 
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected
    };
  } catch (error) {
    console.error('❌ Error sending custom package creation email:', {
      error: error.message,
      stack: error.stack,
      to: request?.contactEmail,
      smtpUser: process.env.SMTP_USER ? 'Set' : 'Missing',
      smtpPass: process.env.SMTP_PASS ? 'Set' : 'Missing',
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com'
    });
    return { success: false, error: error.message };
  }
};

// Helper functions for transaction email
const getTransactionTypeLabel = (type) => {
  const labels = {
    'b2c_purchase': 'Individual Purchase',
    'b2c_renewal': 'Individual Renewal',
    'b2b_contract': 'Business Contract',
    'b2e_contract': 'Education Contract'
  };
  return labels[type] || type;
};

const getOrganizationTypeLabel = (type) => {
  const labels = {
    'company': 'Company',
    'bank': 'Bank',
    'school': 'School',
    'govt': 'Government',
    'other': 'Organization'
  };
  return labels[type] || 'Organization';
};

const getPackageTypeLabel = (type) => {
  const labels = {
    'digital': 'Digital',
    'physical': 'Physical',
    'digital_physical': 'Digital + Physical',
    'standard': 'Standard',
    'renewal': 'Renewal'
  };
  return labels[type] || type || 'Standard';
};

const calculateExpiryInfo = (endDate) => {
  if (!endDate) return null;
  const now = new Date();
  const expiry = new Date(endDate);
  const diffTime = expiry - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { status: 'expired', days: 0, message: 'Expired' };
  } else if (diffDays === 0) {
    return { status: 'today', days: 0, message: 'Expires today' };
  } else if (diffDays === 1) {
    return { status: 'tomorrow', days: 1, message: 'Expires tomorrow' };
  } else if (diffDays <= 30) {
    return { status: 'soon', days: diffDays, message: `Expires in ${diffDays} days` };
  } else if (diffDays <= 365) {
    const months = Math.floor(diffDays / 30);
    return { status: 'active', days: diffDays, message: `Expires in ${months} month${months > 1 ? 's' : ''} (${diffDays} days)` };
  } else {
    const years = Math.floor(diffDays / 365);
    const remainingDays = diffDays % 365;
    return { status: 'active', days: diffDays, message: `Expires in ${years} year${years > 1 ? 's' : ''}${remainingDays > 0 ? ` and ${remainingDays} days` : ''}` };
  }
};

const createTransactionSuccessEmailTemplate = (transaction, user, package, organization = null) => {
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const isOrganizationTransaction = transaction.type === 'b2b_contract' || transaction.type === 'b2e_contract';
  const organizationName = organization?.name || (isOrganizationTransaction ? 'Your Organization' : null);
  const organizationType = organization?.type ? getOrganizationTypeLabel(organization.type) : null;
  
  // Get package type (prefer packageType, fallback to type, then category)
  const packageType = transaction.packageType || package.packageType || package.type || package.category || 'standard';
  const packageTypeLabel = getPackageTypeLabel(packageType);
  
  // Calculate expiry information
  const expiryInfo = transaction.contractPeriod?.endDate ? calculateExpiryInfo(transaction.contractPeriod.endDate) : null;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful - Your Unique Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: ${colors.background};">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${colors.background}; padding: 20px;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: ${colors.white}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: ${colors.white}; font-size: 28px; font-weight: 700;">Konfydence</h1>
              <p style="margin: 5px 0 0 0; color: ${colors.accent}; font-size: 14px; font-weight: 500;">Safer Digital Decisions</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: ${colors.primary}; font-size: 24px; font-weight: 700;">Payment Successful!</h2>
              
              <p style="margin: 0 0 20px 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                Dear ${user.name || 'Valued Customer'},
              </p>
              
              <p style="margin: 0 0 20px 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                Thank you for your purchase! Your payment has been successfully processed.
              </p>

              <!-- Note Section -->
              <div style="background-color: ${colors.background}; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: ${colors.primary}; font-size: 16px; font-weight: 600;">Note</h3>
                <p style="margin: 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  This unique code is for you. You can use this code to play the game.
                </p>
              </div>
              
              <!-- Unique Code Badge -->
              <table role="presentation" style="width: 100%; margin: 30px 0; border-collapse: collapse;">
                <tr>
                  <td style="background: linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 100%); color: ${colors.white}; padding: 20px; border-radius: 8px; text-align: center;">
                    <p style="margin: 0 0 10px 0; color: ${colors.white}; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Your Unique Code</p>
                    <p style="margin: 0; color: ${colors.white}; font-size: 32px; font-weight: 700; letter-spacing: 2px; font-family: 'Courier New', monospace;">${transaction.uniqueCode}</p>
                  </td>
                </tr>
              </table>
              
              <!-- Package Details -->
              <div style="background-color: ${colors.background}; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">Package Details</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Package Name:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${package.name || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Package Type:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">
                      <span style="background-color: ${packageType === 'physical' ? '#FF6B6B' : packageType === 'digital' ? '#4ECDC4' : '#95E1D3'}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                        ${packageTypeLabel}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Transaction Type:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${getTransactionTypeLabel(transaction.type)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Amount Paid:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.primary}; font-size: 16px; font-weight: 700;">
                      ${((transaction.currency || 'EUR') === 'EUR' ? '€' : (transaction.currency || 'EUR'))}${transaction.amount || 0}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Max Seats:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px; font-weight: 600;">${transaction.maxSeats || 5} seat${(transaction.maxSeats || 5) > 1 ? 's' : ''}</td>
                  </tr>
                  ${transaction.contractPeriod?.startDate ? `
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Contract Start Date:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${formatDate(transaction.contractPeriod.startDate)}</td>
                  </tr>
                  ` : ''}
                  ${transaction.contractPeriod?.endDate ? `
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Contract End Date:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${formatDate(transaction.contractPeriod.endDate)}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              ${expiryInfo ? `
              <!-- Expiry Information -->
              <div style="background-color: ${expiryInfo.status === 'expired' ? '#FFE5E5' : expiryInfo.status === 'soon' || expiryInfo.status === 'today' ? '#FFF4E5' : '#E5F5F0'}; border-left: 4px solid ${expiryInfo.status === 'expired' ? '#FF6B6B' : expiryInfo.status === 'soon' || expiryInfo.status === 'today' ? '#FFA500' : '#4ECDC4'}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">Package Expiry Information</h3>
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 16px; font-weight: 600;">
                  ${expiryInfo.message}
                </p>
                ${transaction.contractPeriod?.endDate ? `
                <p style="margin: 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  <strong>Expiry Date:</strong> ${formatDate(transaction.contractPeriod.endDate)}
                </p>
                ` : ''}
                ${packageType === 'physical' ? `
                <p style="margin: 10px 0 0 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  <strong>Note:</strong> This is a physical package. You will receive physical cards for offline game play.
                </p>
                ` : packageType === 'digital' ? `
                <p style="margin: 10px 0 0 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  <strong>Note:</strong> This is a digital package. You can play the game online using your unique code.
                </p>
                ` : packageType === 'digital_physical' ? `
                <p style="margin: 10px 0 0 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  <strong>Note:</strong> This package includes both digital and physical components. You can play online and also receive physical cards.
                </p>
                ` : ''}
              </div>
              ` : ''}
              
              <!-- Instructions -->
              <div style="background-color: #FFF9E6; border-left: 4px solid ${colors.accent}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 15px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">How to Use Your Code</h3>
                <ol style="margin: 0; padding-left: 20px; color: ${colors.text}; font-size: 14px; line-height: 1.8;">
                  <li style="margin-bottom: 10px;">Visit the game page on Konfydence website</li>
                  <li style="margin-bottom: 10px;">Enter your unique code: <strong style="color: ${colors.primary}; font-family: 'Courier New', monospace;">${transaction.uniqueCode}</strong></li>
                  <li style="margin-bottom: 10px;">Start playing the game with your ${transaction.maxSeats || 5} seat${(transaction.maxSeats || 5) > 1 ? 's' : ''}</li>
                  <li>Each seat can be used once to play the game</li>
                </ol>
              </div>
              
              <!-- Important Notes -->
              <div style="margin: 30px 0;">
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; font-weight: 600;">Important Notes:</p>
                <ul style="margin: 0; padding-left: 20px; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  <li style="margin-bottom: 8px;">Keep this code safe and secure</li>
                  <li style="margin-bottom: 8px;">Package Type: <strong>${packageTypeLabel}</strong></li>
                  <li style="margin-bottom: 8px;">You have ${transaction.maxSeats || 5} seat${(transaction.maxSeats || 5) > 1 ? 's' : ''} available for game play</li>
                  <li style="margin-bottom: 8px;">Each seat can only be used once</li>
                  ${expiryInfo ? `
                  <li style="margin-bottom: 8px;">Package Expiry: <strong>${expiryInfo.message}</strong>${transaction.contractPeriod?.endDate ? ` (${formatDate(transaction.contractPeriod.endDate)})` : ''}</li>
                  ` : transaction.contractPeriod?.endDate ? `
                  <li style="margin-bottom: 8px;">Your code is valid until ${formatDate(transaction.contractPeriod.endDate)}</li>
                  ` : ''}
                  ${packageType === 'physical' ? `
                  <li style="margin-bottom: 8px;">Physical cards will be delivered separately. Online game play is not available for physical packages.</li>
                  ` : packageType === 'digital_physical' ? `
                  <li style="margin-bottom: 8px;">You can play online immediately. Physical cards will be delivered separately.</li>
                  ` : ''}
                </ul>
              </div>
              
              <!-- Contact Info -->
              <div style="border-top: 2px solid ${colors.background}; padding-top: 20px; margin-top: 30px;">
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  If you have any questions or need assistance, please don't hesitate to contact us.
                </p>
                <p style="margin: 0; color: ${colors.secondary}; font-size: 14px; font-weight: 600;">
                  Best regards,<br>
                  The Konfydence Team
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: ${colors.primary}; padding: 20px 30px; text-align: center;">
              <p style="margin: 0; color: ${colors.white}; font-size: 12px;">
                © ${new Date().getFullYear()} Konfydence. All rights reserved.
              </p>
              <p style="margin: 5px 0 0 0; color: ${colors.accent}; font-size: 12px;">
                Safer Digital Decisions
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const sendTransactionSuccessEmail = async (transaction, user, package, organization = null) => {
  try {
    // Check if email service is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('Email service not configured. Skipping transaction success email.');
      return { success: false, message: 'Email service not configured' };
    }

    // Check if user has email
    if (!user.email) {
      console.warn('User does not have email address. Skipping email send.');
      return { success: false, message: 'User email not available' };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user.email)) {
      console.error('Invalid email format:', user.email);
      return { success: false, message: 'Invalid email format' };
    }

    // Calculate package type and expiry info before creating template
    const packageType = transaction.packageType || package.packageType || package.type || package.category || 'standard';
    const packageTypeLabel = getPackageTypeLabel(packageType);
    const expiryInfo = transaction.contractPeriod?.endDate ? calculateExpiryInfo(transaction.contractPeriod.endDate) : null;

    const transporter = createTransporter();
    const emailHtml = createTransactionSuccessEmailTemplate(transaction, user, package, organization);

    const isOrganizationTransaction = transaction.type === 'b2b_contract' || transaction.type === 'b2e_contract';
    const organizationName = organization?.name || (isOrganizationTransaction ? 'Your Organization' : null);
    const organizationType = organization?.type;

    // Create text version for email clients that don't support HTML
    const textVersion = `Dear ${user.name || 'Valued Customer'},

Thank you for your purchase! Your payment has been successfully processed.

Note:
This unique code is for you. You can use this code to play the game.

Your Unique Code: ${transaction.uniqueCode}

Package Details:
- Package Name: ${package?.name || 'N/A'

}image.png
- Package Type: ${packageTypeLabel}
- Transaction Type: ${getTransactionTypeLabel(transaction.type)}
- Amount Paid: ${transaction.currency || 'EUR'}${transaction.amount || 0}
- Max Seats: ${transaction.maxSeats || 5} seat${(transaction.maxSeats || 5) > 1 ? 's' : ''}
${transaction.contractPeriod?.startDate ? `- Contract Start Date: ${new Date(transaction.contractPeriod.startDate).toLocaleDateString()}` : ''}
${transaction.contractPeriod?.endDate ? `- Contract End Date: ${new Date(transaction.contractPeriod.endDate).toLocaleDateString()}` : ''}
${expiryInfo ? `- Package Expiry: ${expiryInfo.message}` : ''}

How to Use Your Code:
1. Visit the game page on Konfydence website
2. Enter your unique code: ${transaction.uniqueCode}
3. Start playing the game with your ${transaction.maxSeats || 5} seat${(transaction.maxSeats || 5) > 1 ? 's' : ''}
4. Each seat can be used once to play the game

Important Notes:
- Keep this code safe and secure
- Package Type: ${packageTypeLabel}
- You have ${transaction.maxSeats || 5} seat${(transaction.maxSeats || 5) > 1 ? 's' : ''} available for game play
- Each seat can only be used once
${expiryInfo ? `- Package Expiry: ${expiryInfo.message}${transaction.contractPeriod?.endDate ? ` (${new Date(transaction.contractPeriod.endDate).toLocaleDateString()})` : ''}` : transaction.contractPeriod?.endDate ? `- Your code is valid until ${new Date(transaction.contractPeriod.endDate).toLocaleDateString()}` : ''}
${packageType === 'physical' ? `- Physical cards will be delivered separately. Online game play is not available for physical packages.` : packageType === 'digital_physical' ? `- You can play online immediately. Physical cards will be delivered separately.` : ''}

If you have any questions or need assistance, please don't hesitate to contact us.

Best regards,
The Konfydence Team`;

    const mailOptions = {
      from: `"Konfydence" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `Payment Successful - Your Unique Code: ${transaction.uniqueCode}`,
      html: emailHtml,
      text: textVersion,
      // Add headers similar to verification emails
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high'
      }
    };

    console.log('Attempting to send transaction success email:', {
      to: user.email,
      from: process.env.SMTP_USER,
      uniqueCode: transaction.uniqueCode,
      packageName: package.name,
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com'
    });

    const info = await transporter.sendMail(mailOptions);
    
    console.log('Transaction success email sent successfully:', {
      messageId: info.messageId,
      to: user.email,
      from: process.env.SMTP_USER,
      uniqueCode: transaction.uniqueCode,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response
    });

    // Log warning if email was rejected
    if (info.rejected && info.rejected.length > 0) {
      console.warn('Email was rejected by SMTP server:', {
        rejected: info.rejected,
        messageId: info.messageId,
        to: user.email
      });
    }

    // Log important note about email delivery
    if (info.accepted && info.accepted.length > 0) {
      console.log('Email accepted by SMTP server. Note: Email may take a few minutes to arrive. Please check spam folder if not received.');
    }

    return { 
      success: true, 
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected
    };
  } catch (error) {
    console.error('Error sending transaction success email:', {
      error: error.message,
      stack: error.stack,
      to: user?.email,
      uniqueCode: transaction?.uniqueCode,
      smtpUser: process.env.SMTP_USER ? 'Set' : 'Missing',
      smtpPass: process.env.SMTP_PASS ? 'Set' : 'Missing',
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com'
    });
    return { success: false, error: error.message };
  }
};

// Send membership termination email
const sendMembershipTerminationEmail = async (member, organizationName, schoolName) => {
  try {
    const transporter = createTransporter();
    
    const orgOrSchoolName = organizationName || schoolName || 'Organization';
    const isSchool = !!schoolName;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Membership Terminated</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F5F8FB;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-collapse: collapse;">
          <tr>
            <td style="background: linear-gradient(135deg, #063C5E 0%, #0B7897 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #FFFFFF; font-size: 28px; font-weight: 700;">Membership Terminated</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #063C5E; font-size: 24px; font-weight: 700;">Dear ${member.name || 'Member'},</h2>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                We are writing to inform you that your membership with <strong>${orgOrSchoolName}</strong> has been terminated.
              </p>
              <div style="background-color: #FFF3CD; border-left: 4px solid #FFC107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-size: 15px; font-weight: 600; line-height: 1.6;">
                  ⚠️ Important: Your access to the ${isSchool ? 'school' : 'organization'} platform has been revoked.
                </p>
              </div>
              <div style="background-color: #F5F8FB; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0B7897;">
                <h3 style="margin: 0 0 10px 0; color: #063C5E; font-size: 18px; font-weight: 600;">Membership Details</h3>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                  <strong>${isSchool ? 'School' : 'Organization'}:</strong> ${orgOrSchoolName}
                </p>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                  <strong>Termination Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                If you have any questions or believe this is an error, please contact the ${isSchool ? 'school' : 'organization'} administrator.
              </p>
              <div style="border-top: 2px solid #F5F8FB; padding-top: 20px; margin-top: 30px;">
                <p style="margin: 0; color: #0B7897; font-size: 14px; font-weight: 600;">
                  Best regards,<br>
                  The Konfydence Team
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #063C5E; padding: 20px 30px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #FFFFFF; font-size: 12px;">
                © 2025 Konfydence. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const mailOptions = {
      from: `"Konfydence" <${process.env.SMTP_USER}>`,
      to: member.email,
      subject: `Membership Terminated - ${orgOrSchoolName}`,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('Membership termination email sent successfully:', {
      messageId: info.messageId,
      to: member.email,
      accepted: info.accepted,
      rejected: info.rejected
    });

    return { 
      success: true, 
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected
    };
  } catch (error) {
    console.error('Error sending membership termination email:', {
      error: error.message,
      stack: error.stack,
      to: member?.email,
      smtpUser: process.env.SMTP_USER ? 'Set' : 'Missing',
      smtpPass: process.env.SMTP_PASS ? 'Set' : 'Missing',
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com'
    });
    return { success: false, error: error.message };
  }
};

const sendOrganizationCreatedEmail = async (user, organization, password) => {
  try {
    // Check if email service is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('Email service not configured. Skipping organization creation email.');
      return { success: false, message: 'Email service not configured' };
    }

    const transporter = createTransporter();
    const loginUrl = `${process.env.FRONTEND_URL}/login`;
    
    const organizationTypeLabels = {
      company: 'Company',
      bank: 'Bank',
      school: 'School',
      govt: 'Government',
      other: organization.customType || 'Other'
    };

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Organization Has Been Created</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: ${colors.background};">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${colors.background}; padding: 20px;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: ${colors.white}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: ${colors.white}; font-size: 28px; font-weight: 700;">Konfydence</h1>
              <p style="margin: 5px 0 0 0; color: ${colors.accent}; font-size: 14px; font-weight: 500;">Safer Digital Decisions</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: ${colors.primary}; font-size: 24px; font-weight: 700;">Your Organization Has Been Created</h2>
              
              <p style="margin: 0 0 20px 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                Dear ${user.name},
              </p>
              
              <p style="margin: 0 0 20px 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                We're excited to inform you that your organization <strong>${organization.name}</strong> has been successfully created in the Konfydence platform.
              </p>
              
              <!-- Organization Details -->
              <div style="background-color: ${colors.background}; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">Organization Details</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Organization Name:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${organization.name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Type:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${organizationTypeLabels[organization.type]}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Segment:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${organization.segment}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Status:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px; text-transform: capitalize;">${organization.status}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Unique Code:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.primary}; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 1px;">${organization.uniqueCode || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Primary Contact:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${organization.primaryContact.name} (${organization.primaryContact.email})</td>
                  </tr>
                </table>
              </div>
              
              <!-- Login Credentials -->
              <div style="background-color: #FFF9E6; border-left: 4px solid ${colors.accent}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 15px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">Your Login Credentials</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Email:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${user.email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Password:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.primary}; font-size: 16px; font-weight: 600; font-family: monospace; letter-spacing: 1px;">${password}</td>
                  </tr>
                </table>
                <p style="margin: 15px 0 0 0; color: #666666; font-size: 12px; line-height: 1.5;">
                  ⚠️ Please keep these credentials secure. We recommend changing your password after your first login.
                </p>
              </div>
              
              <!-- Login Instructions -->
              <div style="background-color: #E8F5E9; border-left: 4px solid #28A745; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; color: ${colors.primary}; font-size: 16px; font-weight: 600;">Next Steps</h3>
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  To access your organization account, please follow these steps:
                </p>
                <ol style="margin: 0; padding-left: 20px; color: ${colors.text}; font-size: 14px; line-height: 1.8;">
                  <li>Click the "Login" button below to access your account</li>
                  <li>Enter your email and password (provided above)</li>
                  <li>After logging in, you'll have access to your organization dashboard</li>
                  <li>We recommend changing your password after your first login for security</li>
                </ol>
              </div>
              
              <!-- Login Button -->
              <table role="presentation" style="width: 100%; margin: 30px 0; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${loginUrl}" style="display: inline-block; background-color: ${colors.secondary}; color: ${colors.white}; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Login to Your Account</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 10px 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Or visit: <a href="${loginUrl}" style="color: ${colors.secondary}; word-break: break-all;">${loginUrl}</a>
              </p>
              
              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                If you have any questions or need assistance, please don't hesitate to contact our support team.
              </p>
              
              <div style="border-top: 2px solid #F5F8FB; padding-top: 20px; margin-top: 30px;">
                <p style="margin: 0; color: ${colors.secondary}; font-size: 14px; font-weight: 600;">
                  Best regards,<br>
                  The Konfydence Team
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: ${colors.primary}; padding: 20px 30px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: ${colors.white}; font-size: 12px;">
                © 2025 Konfydence. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const mailOptions = {
      from: `"Konfydence" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `Your Organization Has Been Created - ${organization.name}`,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('Organization creation email sent successfully:', {
      messageId: info.messageId,
      to: user.email,
      organizationName: organization.name,
      accepted: info.accepted,
      rejected: info.rejected
    });

    return { 
      success: true, 
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected
    };
  } catch (error) {
    console.error('Error sending organization creation email:', {
      error: error.message,
      stack: error.stack,
      to: user?.email,
      organizationName: organization?.name,
      smtpUser: process.env.SMTP_USER ? 'Set' : 'Missing',
      smtpPass: process.env.SMTP_PASS ? 'Set' : 'Missing',
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com'
    });
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendStatusUpdateEmail,
  sendCustomPackageCreatedEmail,
  sendTransactionSuccessEmail,
  sendMembershipTerminationEmail,
  sendOrganizationCreatedEmail,
  createTransporter,
};

