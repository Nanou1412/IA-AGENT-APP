'use client';

import { useState, useTransition } from 'react';
import { Button } from '@repo/ui';
import { assignTemplateToOrg } from '@/actions/admin';

interface Template {
  id: string;
  slug: string;
  version: string;
  title: string;
}

interface TemplateAssignmentFormProps {
  orgId: string;
  currentTemplateSlug?: string;
  currentTemplateVersion?: string;
  availableTemplates: Template[];
}

export function TemplateAssignmentForm({
  orgId,
  currentTemplateSlug,
  currentTemplateVersion,
  availableTemplates,
}: TemplateAssignmentFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState(currentTemplateSlug || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!selectedSlug) {
      setError('Please select a template');
      return;
    }

    startTransition(async () => {
      const result = await assignTemplateToOrg(orgId, selectedSlug);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    });
  };

  const currentTemplate = availableTemplates.find(t => t.slug === currentTemplateSlug);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          ✅ Template assigned successfully!
        </div>
      )}

      {/* Current Assignment */}
      {currentTemplate && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-700">
            <span className="font-medium">Current:</span> {currentTemplate.title}
            <span className="text-blue-500 ml-2">
              ({currentTemplateSlug}@{currentTemplateVersion})
            </span>
          </div>
        </div>
      )}

      {/* Template Selector */}
      <div>
        <label htmlFor="templateSlug" className="block text-sm font-medium text-gray-700 mb-1">
          Select Template
        </label>
        {availableTemplates.length === 0 ? (
          <p className="text-sm text-gray-500">No templates available. Create one in Admin → Templates.</p>
        ) : (
          <select
            id="templateSlug"
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="">-- Select a template --</option>
            {availableTemplates.map((template) => (
              <option key={template.id} value={template.slug}>
                {template.title} ({template.slug}@{template.version})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Submit */}
      {availableTemplates.length > 0 && (
        <div className="pt-2">
          <Button 
            variant="primary" 
            type="submit" 
            disabled={isPending || !selectedSlug}
            size="sm"
          >
            {isPending ? 'Assigning...' : 'Assign Template'}
          </Button>
        </div>
      )}
    </form>
  );
}
