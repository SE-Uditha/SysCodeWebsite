'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRight, CheckCircle2, CircleAlert } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { contactFormSchema, type ContactFormValues } from '@/lib/validations';
import { GradientButton } from '@/components/ui/GradientButton';
import type { PricingTier } from '@/data/pricing';

type NotificationState = { type: 'success' | 'error'; message: string } | null;

const fieldClassName = 'min-h-[3.25rem] w-full min-w-0 max-w-full rounded-xl border border-orange-200/70 bg-white px-3.5 py-3 text-base text-black outline-none transition-[border-color,box-shadow] duration-200 focus:border-orange-700 focus:ring-4 focus:ring-orange-100/60';
const labelClassName = 'mb-2 block text-xs font-semibold leading-5 text-black/80 [overflow-wrap:anywhere] min-[1600px]:text-sm';

const serviceOptions = ['Business Website', 'E-Commerce Website', 'Custom Web Application', 'POS System', 'Website Redesign', 'Maintenance', 'Other'];
type PackageOption = { id: string; name: string; label: string };
const legacyPackageIds: Record<string, string> = {
  'Basic Website': 'basic',
  'Business Website': 'business',
  'Premium Website': 'premium',
};
const budgetOptions = ['Rs. 10,000 – Rs. 25,000', 'Rs. 25,000 – Rs. 50,000', 'Rs. 50,000 – Rs. 100,000', 'Above Rs. 100,000'];

export function ContactForm({ packages }: { packages: PricingTier[] }) {
  const packageOptions = useMemo(() => packages.map((tier) => ({
    id: tier.id,
    name: tier.name,
    label: `${tier.name.replace(/ Website$/, '')} – Rs. ${new Intl.NumberFormat('en-LK').format(tier.startPrice)}+`,
  })), [packages]);

  return (
    <Suspense
      fallback={
        <div role="status" className="premium-panel flex min-h-[600px] w-full min-w-0 items-center justify-center p-5 text-sm text-black sm:p-8">
          Loading quotation form…
        </div>
      }
    >
      <ContactFormFields packageOptions={packageOptions} />
    </Suspense>
  );
}

function ContactFormFields({ packageOptions }: { packageOptions: PackageOption[] }) {
  const formId = useId();
  const searchParams = useSearchParams();
  const [notification, setNotification] = useState<NotificationState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      businessName: '',
      projectDescription: '',
    },
  });

  useEffect(() => {
    const selectedPackage = searchParams.get('package');
    if (selectedPackage) {
      const packageId = legacyPackageIds[selectedPackage] ?? selectedPackage;
      const option = packageOptions.find((item) => item.id === packageId || item.name === selectedPackage || item.label === selectedPackage);
      if (option) setValue('preferredPackage', option.label);
      else if (selectedPackage === 'Custom Quotation') setValue('preferredPackage', selectedPackage);
    }
  }, [packageOptions, searchParams, setValue]);

  const onSubmit = async (values: ContactFormValues) => {
    setIsSubmitting(true);
    setNotification(null);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Something went wrong. Please try again.');
      }

      setNotification({ type: 'success', message: payload.message || 'Your quote request was sent successfully.' });
    } catch (error) {
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to send your request right now.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="premium-panel w-full min-w-0 max-w-4xl space-y-6 p-5 sm:p-8 xl:p-10">
      <div className="flex items-start justify-between gap-4 border-b border-orange-100 pb-6">
        <div className="min-w-0">
          <p className="font-heading text-xl font-bold tracking-tight text-black sm:text-2xl">Your project starts here.</p>
          <p className="mt-2 text-sm leading-6 text-black/65">A few details to help us understand your idea.</p>
        </div>
        <span className="premium-icon shrink-0"><ArrowUpRight className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /></span>
      </div>
      {notification ? (
        <div role={notification.type === 'error' ? 'alert' : 'status'} className="flex min-w-0 gap-3 rounded-xl border border-orange-200 bg-white px-3 py-4 text-sm text-black sm:px-4">
          {notification.type === 'success' ? <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-orange-700" /> : <CircleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-orange-700" />}
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="font-semibold">{notification.type === 'success' ? 'Request sent' : 'Unable to send request'}</p>
            <p className="mt-1">{notification.message}</p>
          </div>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 md:grid-cols-2 sm:gap-5 [&>div]:min-w-0">
        <div>
          <label htmlFor={`${formId}-fullName`} className={labelClassName}>Full Name</label>
          <input id={`${formId}-fullName`} autoComplete="name" aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? `${formId}-fullName-error` : undefined} {...register('fullName')} className={fieldClassName} />
          {errors.fullName ? <p id={`${formId}-fullName-error`} className="mt-1.5 text-xs text-orange-800 [overflow-wrap:anywhere]">{errors.fullName.message}</p> : null}
        </div>
        <div>
          <label htmlFor={`${formId}-email`} className={labelClassName}>Email Address</label>
          <input id={`${formId}-email`} type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${formId}-email-error` : undefined} {...register('email')} className={fieldClassName} />
          {errors.email ? <p id={`${formId}-email-error`} className="mt-1.5 text-xs text-orange-800 [overflow-wrap:anywhere]">{errors.email.message}</p> : null}
        </div>
        <div>
          <label htmlFor={`${formId}-phoneNumber`} className={labelClassName}>Phone Number</label>
          <input id={`${formId}-phoneNumber`} type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phoneNumber)} aria-describedby={errors.phoneNumber ? `${formId}-phoneNumber-error` : undefined} {...register('phoneNumber')} className={fieldClassName} />
          {errors.phoneNumber ? <p id={`${formId}-phoneNumber-error`} className="mt-1.5 text-xs text-orange-800 [overflow-wrap:anywhere]">{errors.phoneNumber.message}</p> : null}
        </div>
        <div>
          <label htmlFor={`${formId}-businessName`} className={labelClassName}>Business Name (optional)</label>
          <input id={`${formId}-businessName`} autoComplete="organization" {...register('businessName')} className={fieldClassName} />
        </div>
        <div>
          <label htmlFor={`${formId}-serviceRequired`} className={labelClassName}>Service Required</label>
          <select id={`${formId}-serviceRequired`} aria-invalid={Boolean(errors.serviceRequired)} aria-describedby={errors.serviceRequired ? `${formId}-serviceRequired-error` : undefined} {...register('serviceRequired')} className={fieldClassName}>
            <option value="">Select a service</option>
            {serviceOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {errors.serviceRequired ? <p id={`${formId}-serviceRequired-error`} className="mt-1.5 text-xs text-orange-800 [overflow-wrap:anywhere]">{errors.serviceRequired.message}</p> : null}
        </div>
        <div>
          <label htmlFor={`${formId}-preferredPackage`} className={labelClassName}>Preferred Package</label>
          <select id={`${formId}-preferredPackage`} aria-invalid={Boolean(errors.preferredPackage)} aria-describedby={errors.preferredPackage ? `${formId}-preferredPackage-error` : undefined} {...register('preferredPackage')} className={fieldClassName}>
            <option value="">Select a package</option>
            {packageOptions.map((option) => (
              <option key={option.id} value={option.label}>{option.label}</option>
            ))}
            <option value="Custom Quotation">Custom Quotation</option>
          </select>
          {errors.preferredPackage ? <p id={`${formId}-preferredPackage-error`} className="mt-1.5 text-xs text-orange-800 [overflow-wrap:anywhere]">{errors.preferredPackage.message}</p> : null}
        </div>
        <div>
          <label htmlFor={`${formId}-estimatedBudget`} className={labelClassName}>Estimated Budget</label>
          <select id={`${formId}-estimatedBudget`} aria-invalid={Boolean(errors.estimatedBudget)} aria-describedby={errors.estimatedBudget ? `${formId}-estimatedBudget-error` : undefined} {...register('estimatedBudget')} className={fieldClassName}>
            <option value="">Select your budget</option>
            {budgetOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {errors.estimatedBudget ? <p id={`${formId}-estimatedBudget-error`} className="mt-1.5 text-xs text-orange-800 [overflow-wrap:anywhere]">{errors.estimatedBudget.message}</p> : null}
        </div>
        <div className="min-w-0 md:col-span-2">
          <label htmlFor={`${formId}-projectDescription`} className={labelClassName}>Project Description</label>
          <textarea id={`${formId}-projectDescription`} rows={5} aria-invalid={Boolean(errors.projectDescription)} aria-describedby={errors.projectDescription ? `${formId}-projectDescription-error` : undefined} {...register('projectDescription')} className={`${fieldClassName} resize-y`} />
          {errors.projectDescription ? <p id={`${formId}-projectDescription-error`} className="mt-1.5 text-xs text-orange-800 [overflow-wrap:anywhere]">{errors.projectDescription.message}</p> : null}
        </div>
      </div>

      <GradientButton type="submit" className="w-full justify-center" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Request Free Quotation'}
      </GradientButton>
      <p className="text-center text-xs leading-5 text-black/55">We’ll use your details to respond to your enquiry.</p>
    </form>
  );
}
