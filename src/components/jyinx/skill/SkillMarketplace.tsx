'use client';

import { useState, useEffect, useCallback } from 'react';
import { skillRegistryService, type RegistrySnapshot } from '@/lib/skillRegistryService';
/**
 * Skill Marketplace UI Component
 * Displays marketplace skills available for hire
 */
export default function SkillMarketplace() {
  const [snapshot, setSnapshot] = useState<RegistrySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    skillRegistryService.refresh().then((data) => {
      if (!cancelled) setSnapshot(data);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load skills');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const marketplaceSkills = snapshot?.marketplace ?? [];
  const handleHire = useCallback(async (skillId: string) => {
    console.log('Hiring skill:', skillId);
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading marketplace skills...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-danger">
        <p>{error}</p>
        <button
          onClick={() => { setLoading(true); setError(null); skillRegistryService.refresh().then((data) => setSnapshot(data)).catch(() => setLoading(false)); }}
          className="mt-2 px-3 py-1 bg-gold/20 border border-gold/30 rounded-lg text-gold text-xs"
        >
          Retry
              </button>
            </div>
  );
}

  if (marketplaceSkills.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No marketplace skills available.
        <button
          onClick={() => { setLoading(true); setError(null); skillRegistryService.refresh().then((data) => setSnapshot(data)).catch(() => setLoading(false)); }}
          className="mt-2 ml-2 px-2 py-0.5 bg-gold/10 border border-gold/20 rounded text-gold text-xs"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Marketplace Skills</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {marketplaceSkills.map((skill) => (
          <div key={skill.id} className="border rounded-lg p-4 shadow-sm">
            <h3 className="font-semibold">{skill.name}</h3>
            <p className="text-sm text-gray-600 mb-2">{skill.description}</p>
            {skill.tags && skill.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {skill.tags.map((tag: string) => (
                  <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => handleHire(skill.id)}
              className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Hire Skill
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
