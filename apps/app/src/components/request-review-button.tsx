'use client';

import { useTransition } from 'react';
import { requestReview } from '@/actions/sandbox';

export function RequestReviewButton() {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await requestReview();
      if (result?.error) {
        alert(result.error);
      } else if (result?.message) {
        alert(result.message);
      }
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
        isPending
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-purple-600 text-white hover:bg-purple-700'
      }`}
    >
      {isPending ? 'Submitting...' : 'Request Production Review'}
    </button>
  );
}
