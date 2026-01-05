import { redirect } from 'next/navigation';
import { isValidIndustrySlug } from '@/lib/industries';

interface RedirectPageProps {
  params: { industry: string };
}

export default function IndustryRedirectPage({ params }: RedirectPageProps) {
  const { industry } = params;

  if (isValidIndustrySlug(industry)) {
    redirect(`/${industry}`);
  }

  redirect('/industries');
}
