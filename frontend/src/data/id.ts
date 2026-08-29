// Small local id generator shared by the repository and store. Not a UUID —
// just needs to be unique within this device's local data, which a
// timestamp + monotonic counter guarantees.
let counter = 0;

export const uid = (): string => `${Date.now().toString(36)}-${(counter++).toString(36)}`;
