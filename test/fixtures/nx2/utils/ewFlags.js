let ewEnabled = async () => false;
export const isEWEnabled = (context) => ewEnabled(context);
export const setEWEnabled = (check) => { ewEnabled = check; };
export const isEwChatDisabled = async () => false;
export const getEWFlags = async () => ({});

let chatAvailability = async () => false;
export const isEwChatEnabled = (context) => chatAvailability(context);
export const setChatAvailability = (check) => { chatAvailability = check; };
