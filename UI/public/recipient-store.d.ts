export function getRecipient(): Promise<string | null>;
export function setRecipient(owner: string, generation?: string, allowed?: () => boolean): Promise<boolean>;
export function clearRecipient(expectedOwner: string, generation?: string, allowed?: () => boolean): Promise<boolean>;
export function claimDelivery(owner: string, key: string): Promise<boolean>;
export function releaseDelivery(owner: string, key: string): Promise<boolean>;
