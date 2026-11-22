let ewEnabled = false;
export const setEWEnabled = (value) => { ewEnabled = value; };
export const isEWEnabled = async () => ewEnabled;
export const isEwChatDisabled = async () => false;
export const getEWFlags = async () => ({});

let chatAvailability = async () => false;
export const isEwChatEnabled = (context) => chatAvailability(context);
export const setChatAvailability = (check) => { chatAvailability = check; };
