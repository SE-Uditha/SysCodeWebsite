import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT ?? '587');
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM ?? 'no-reply@syscode.dev';

export function hasEmailConfig() {
  return Boolean(smtpHost && smtpUser && smtpPass);
}

export function createTransport() {
  if (!hasEmailConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: true,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

export async function sendInquiryEmail(data: {
  fullName: string;
  email: string;
  phoneNumber: string;
  businessName?: string;
  serviceRequired: string;
  preferredPackage: string;
  estimatedBudget: string;
  projectDescription: string;
}) {
  const transporter = createTransport();

  if (!transporter) {
    throw new Error('Email configuration is missing. Add SMTP credentials in the environment variables.');
  }

  const escaped = Object.fromEntries(Object.entries(data).map(([field, value]) => [field,
    String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!),
  ]));

  await transporter.sendMail({
    from: smtpFrom,
    to: process.env.CONTACT_EMAIL ?? 'hello@syscode.dev',
    replyTo: data.email,
    subject: `New website inquiry from ${data.fullName}`,
    text: `Name: ${data.fullName}\nEmail: ${data.email}\nPhone: ${data.phoneNumber}\nBusiness: ${data.businessName || 'N/A'}\nService: ${data.serviceRequired}\nPackage: ${data.preferredPackage}\nBudget: ${data.estimatedBudget}\n\nProject Details:\n${data.projectDescription}`,
    html: `
      <h2>New Website Inquiry</h2>
      <ul>
        <li><strong>Name:</strong> ${escaped.fullName}</li>
        <li><strong>Email:</strong> ${escaped.email}</li>
        <li><strong>Phone:</strong> ${escaped.phoneNumber}</li>
        <li><strong>Business:</strong> ${escaped.businessName || 'N/A'}</li>
        <li><strong>Service:</strong> ${escaped.serviceRequired}</li>
        <li><strong>Package:</strong> ${escaped.preferredPackage}</li>
        <li><strong>Budget:</strong> ${escaped.estimatedBudget}</li>
      </ul>
      <p><strong>Project Details:</strong></p>
      <p>${escaped.projectDescription.replace(/\n/g, '<br />')}</p>
    `,
  });
}
