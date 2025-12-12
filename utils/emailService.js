const nodemailer = require('nodemailer');

// Email configuration - update these in your .env file
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
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
                  <tr>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Base Package:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${request.basePackageId?.name || 'N/A'}</td>
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
- Base Package: ${request.basePackageId?.name || 'N/A'}
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
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;"><strong>Base Package:</strong></td>
                    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px;">${request.basePackageId?.name || 'N/A'}</td>
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
                      ${customPackage.contractPricing?.currency || 'EUR'}${customPackage.contractPricing?.amount || 0}
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
              
              ${customPackage.effectiveCardIds && customPackage.effectiveCardIds.length > 0 ? `
              <!-- Included Cards -->
              <div style="background-color: ${colors.background}; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: ${colors.primary}; font-size: 18px; font-weight: 600;">Included Cards (${customPackage.effectiveCardIds.length})</h3>
                <ul style="margin: 0; padding-left: 20px; color: ${colors.text}; font-size: 14px; line-height: 1.8;">
                  ${customPackage.effectiveCardIds.map(card => `
                    <li>${card.title || card.name || 'Card'}</li>
                  `).join('')}
                </ul>
              </div>
              ` : ''}
              
              <!-- Next Steps -->
              <div style="margin: 30px 0;">
                <p style="margin: 0 0 15px 0; color: ${colors.text}; font-size: 16px; font-weight: 600;">What's Next?</p>
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
                  Your custom package is now active and ready to use. You can access it through your organization dashboard.
                </p>
                <p style="margin: 0 0 10px 0; color: ${colors.text}; font-size: 14px; line-height: 1.6;">
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
      console.warn('Email service not configured. Skipping email send.');
      return { success: false, message: 'Email service not configured' };
    }

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
- Package Name: ${customPackage.name || request.basePackageId?.name || 'Custom Package'}
- Organization: ${request.organizationName}
- Base Package: ${request.basePackageId?.name || 'N/A'}
- Seat Limit: ${customPackage.seatLimit || request.requestedModifications?.seatLimit || 'N/A'}
- Contract Start Date: ${customPackage.contract?.startDate ? new Date(customPackage.contract.startDate).toLocaleDateString() : 'N/A'}
- Contract End Date: ${customPackage.contract?.endDate ? new Date(customPackage.contract.endDate).toLocaleDateString() : 'N/A'}
- Contract Status: ${customPackage.contract?.status || 'Active'}

Pricing Information:
- Amount: ${customPackage.contractPricing?.currency || 'EUR'}${customPackage.contractPricing?.amount || 0}
- Billing Type: ${customPackage.contractPricing?.billingType || 'N/A'}

Your custom package is now active and ready to use. You can access it through your organization dashboard.

Our team will be in touch shortly to help you get started.

If you have any questions, please don't hesitate to contact us.

Best regards,
The Konfydence Team
      `.trim(),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Custom package creation email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending custom package creation email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendStatusUpdateEmail,
  sendCustomPackageCreatedEmail,
  createTransporter,
};

