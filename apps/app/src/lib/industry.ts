import { cookies } from 'next/headers';

export function getPreferredIndustryFromCookie(): string | undefined {
  const cookieStore = cookies();
  return cookieStore.get('preferred_industry')?.value;
}
