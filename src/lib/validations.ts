import { z } from 'zod';

export const contactFormSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.').max(200),
  email: z.string().trim().email('Please enter a valid email address.').max(254),
  phoneNumber: z.string().trim().min(7, 'Please enter a valid phone number.').max(40),
  businessName: z.string().trim().max(200).optional().or(z.literal('')),
  serviceRequired: z.string().trim().min(1, 'Please select a service.').max(200),
  preferredPackage: z.string().trim().min(1, 'Please select a package.').max(200),
  estimatedBudget: z.string().trim().min(1, 'Please select your budget.').max(100),
  projectDescription: z.string().trim().min(20, 'Please provide a bit more detail about your project.').max(10000),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
