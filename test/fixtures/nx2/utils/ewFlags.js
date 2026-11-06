export const isEWEnabled = async () => false;
export const isEwChatDisabled = async () => false;
export const getEWFlags = async () => ({});

let chatAvailability = async () => false;
export const isEwChatEnabled = (context) => chatAvailability(context);
export const setChatAvailability = (check) => { chatAvailability = check; };
