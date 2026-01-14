'use client';

import { useTransition } from 'react';
import { startSandbox } from '@/actions/sandbox';

interface StartSandboxButtonProps {
  disabled?: boolean;
}

export function StartSandboxButton({ disabled = false }: StartSandboxButtonProps) {
  const [isPending, startTransition] = useTransition();
  const handleClick = () => {
    startTransition(async () => {
      const result = await startSandbox();
      if (result?.error) {
        alert(result.error);
      }
      // If successful, the action redirects to /app
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isPending}
      className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
        disabled || isPending
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {isPending ? 'Starting...' : 'Start Sandbox Session'}
    </button>
  );
}
