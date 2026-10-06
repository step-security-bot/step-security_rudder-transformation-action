import { getAmount, getDiscount, getTotal } from "pricing";
import { getCity, getRegion, getCountry } from "location";

export function transformEvent(event, metadata) {
  const props = event.properties || {};
  const loc = event.context?.traits?.location || {};
  return {
    amount: getAmount(props),
    discount: getDiscount(props),
    total: getTotal(props),
    city: getCity(loc),
    region: getRegion(loc),
    country: getCountry(loc),
  };
}
