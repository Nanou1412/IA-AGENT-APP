'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createTemplate } from '@/actions/admin';

interface TemplateData {
  id: string;
  slug: string;
  version: string;
  title: string;
  systemPrompt: string;
  intentsAllowed: string[];
  modulesDefault: string[];
  handoffTriggers: string[];
}

interface CreateTemplateFormProps {
  existingSlugs: string[];
  latestTemplates: TemplateData[];
}

const AVAILABLE_MODULES = [
  'booking',
  'payment',
  'takeaway',
  'menu',
  'faq',
  'handoff',
  'voicemail',
];

export function CreateTemplateForm({ existingSlugs, latestTemplates }: CreateTemplateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  const [mode, setMode] = useState<'new' | 'version'>('new');
  const [basedOnSlug, setBasedOnSlug] = useState<string>('');
  
  const [slug, setSlug] = useState('');
  const [version, setVersion] = useState('1.0');
  const [title, setTitle] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [modulesDefault, setModulesDefault] = useState<string[]>(['faq', 'handoff']);
  const [intentsAllowed, setIntentsAllowed] = useState('');
  const [handoffTriggers, setHandoffTriggers] = useState('');
  
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // When changing base template, populate fields
  useEffect(() => {
    if (mode === 'version' && basedOnSlug) {
      const base = latestTemplates.find(t => t.slug === basedOnSlug);
      if (base) {
        setSlug(base.slug);
        // Increment version
        const parts = base.version.split('.');
        const major = parseInt(parts[0] || '1', 10);
        const minor = parseInt(parts[1] || '0', 10) + 1;
        setVersion(`${major}.${minor}`);
        setTitle(base.title);
        setSystemPrompt(base.systemPrompt);
        setModulesDefault(base.modulesDefault);
        setIntentsAllowed(base.intentsAllowed.join('\n'));
        setHandoffTriggers(base.handoffTriggers.join('\n'));
      }
    }
  }, [mode, basedOnSlug, latestTemplates]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setMessage({ type: 'error', text: 'Slug must be lowercase alphanumeric with hyphens only' });
      return;
    }

    startTransition(async () => {
      const result = await createTemplate({
        slug,
        version,
        title,
        systemPrompt,
        intentsAllowed: intentsAllowed.split('\n').map(s => s.trim()).filter(Boolean),
        modulesDefault,
        handoffTriggers: handoffTriggers.split('\n').map(s => s.trim()).filter(Boolean),
      });

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Template created successfully' });
        setTimeout(() => router.push('/admin/templates'), 1500);
      }
    });
  };

  const toggleModule = (module: string) => {
    setModulesDefault(prev => 
      prev.includes(module) 
        ? prev.filter(m => m !== module)
        : [...prev, module]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Mode Selection */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            checked={mode === 'new'}
            onChange={() => {
              setMode('new');
              setBasedOnSlug('');
              setSlug('');
              setVersion('1.0');
              setTitle('');
              setSystemPrompt('');
              setModulesDefault(['faq', 'handoff']);
              setIntentsAllowed('');
              setHandoffTriggers('');
            }}
            className="text-blue-600"
          />
          <span className="text-sm font-medium">New Template</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            checked={mode === 'version'}
            onChange={() => setMode('version')}
            className="text-blue-600"
            disabled={existingSlugs.length === 0}
          />
          <span className="text-sm font-medium">New Version of Existing</span>
        </label>
      </div>

      {/* Base Template Selection (for versioning) */}
      {mode === 'version' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Based on Template
          </label>
          <select
            value={basedOnSlug}
            onChange={(e) => setBasedOnSlug(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">Select template...</option>
            {existingSlugs.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
            Slug
          </label>
          <input
            id="slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="restaurant-agent"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={mode === 'version'}
          />
          <p className="mt-1 text-xs text-gray-500">
            Lowercase, alphanumeric, hyphens only
          </p>
        </div>

        <div>
          <label htmlFor="version" className="block text-sm font-medium text-gray-700 mb-1">
            Version
          </label>
          <input
            id="version"
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Restaurant Booking Agent"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="systemPrompt" className="block text-sm font-medium text-gray-700 mb-1">
          System Prompt
        </label>
        <textarea
          id="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={8}
          placeholder="You are a friendly AI assistant for a restaurant. You help customers with reservations, menu questions, and general inquiries..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          The main instructions for the AI agent
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Default Modules
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_MODULES.map((module) => (
            <button
              key={module}
              type="button"
              onClick={() => toggleModule(module)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                modulesDefault.includes(module)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {module}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="intentsAllowed" className="block text-sm font-medium text-gray-700 mb-1">
          Allowed Intents (one per line)
        </label>
        <textarea
          id="intentsAllowed"
          value={intentsAllowed}
          onChange={(e) => setIntentsAllowed(e.target.value)}
          rows={4}
          placeholder="booking.create&#10;booking.cancel&#10;menu.query&#10;hours.query"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
        />
      </div>

      <div>
        <label htmlFor="handoffTriggers" className="block text-sm font-medium text-gray-700 mb-1">
          Handoff Triggers (one per line)
        </label>
        <textarea
          id="handoffTriggers"
          value={handoffTriggers}
          onChange={(e) => setHandoffTriggers(e.target.value)}
          rows={3}
          placeholder="speak to manager&#10;complaint&#10;refund request"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Phrases that trigger a handoff to human agent
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Creating...' : 'Create Template'}
        </button>
      </div>
    </form>
  );
}
