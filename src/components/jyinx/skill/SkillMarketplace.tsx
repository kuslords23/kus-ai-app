'use client';

import { useState, useEffect } from 'react';
import { skillRegistryService } from '../../lib/skillRegistryService';
import { SkillMetadata, SkillSource, RegistryStatus } from '../../configs/skillRegistry';

/**
 * Skill Marketplace UI Component
 * Displays marketplace skills available for hire
 * Integrates with RAG Firewall for security validation
 */
export default function SkillMarketplace() {
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [status, setStatus] = useState<RegistryStatus>(RegistryStatus.OFFLINE);

  useEffect(() => {
    const unsubscribe = skillRegistryService.subscribe((s, r) => {
      setStatus(s);
      setSkills(r.marketplaceSkills);
    });
    return unsubscribe;
  }, []);

  const handleHire = async (skill: SkillMetadata) => {
    // Implement rental logic
    console.log(`Hiring skill: ${skill.name}`);
  };

  if (status === RegistryStatus.OFFLINE) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading marketplace skills...
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Marketplace Skills</h2>
      {skills.length === 0 ? (
        <p className="text-gray-500">No marketplace skills available.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map((skill) => (
            <div key={skill.id} className="border rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold">{skill.name}</h3>
              <p className="text-sm text-gray-600 mb-2">{skill.description}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {skill.tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {tag}
                  </span>
                ))}
              </div>
              <button
                onClick={() => handleHire(skill)}
                className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Hire Skill
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}