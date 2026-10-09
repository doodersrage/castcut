import { getCharacter } from './character-os';
import { resolveCastFaceForPlate } from './character-identity';
import { resolveFittingPlateFromCharacter } from './character-plate';
import { referenceViewUrl } from './reference-check-client';
import type { ReferenceHealthItem, ReferenceHealthSource } from './reference-health';
import { loadSettingsCache } from './settings-cache';

/** Workflow health: Day's partner (plate and face lock) and the invented partner's face. */
export const dayPartnerReferenceHealth: ReferenceHealthSource = ({ lead, leadPlate }) => {
  const day = loadSettingsCache().tools.day;
  const items: ReferenceHealthItem[] = [];
  const partnerId = day?.partnerCharacterId?.trim();
  const partner = partnerId && partnerId !== lead?.id ? getCharacter(partnerId) : undefined;
  if (partner) {
    const plate = resolveFittingPlateFromCharacter(partner);
    if (plate) {
      items.push({
        key: 'partner-plate',
        label: `${partner.name || 'Partner'} — plate (Day partner)`,
        check: {
          role: 'plate',
          filename: plate.filename,
          imageUrl: plate.imageUrl,
          subject: partner.name,
        },
      });
    }
    const lock = resolveCastFaceForPlate(partner);
    if (lock) {
      items.push({
        key: 'partner-face',
        label: `${partner.name || 'Partner'} — face lock (Day partner)`,
        check: {
          role: 'partner-face',
          filename: lock.filename,
          imageUrl: lock.imageUrl,
          subject: partner.name,
          partnerReferenceUrl: referenceViewUrl(plate),
          leadReferenceUrl: referenceViewUrl(leadPlate),
        },
      });
    }
  }
  const standIn = day?.partnerStandIn;
  if (standIn?.filename?.trim()) {
    items.push({
      key: 'stand-in-face',
      label: 'Invented Day partner — face',
      check: { role: 'face', filename: standIn.filename, subject: "the partner's" },
    });
  }
  return items;
};
