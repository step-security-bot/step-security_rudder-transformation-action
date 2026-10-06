const toNum = (val) => parseFloat(val ?? 0) || 0;

export const getAmount = (order) => toNum(order?.amount);
export const getDiscount = (order) => toNum(order?.discount);
export const getTotal = (order) => getAmount(order) - getDiscount(order);
