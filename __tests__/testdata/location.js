const UNKNOWN = "unknown";

function resolve(obj, key) {
  return obj?.[key] || UNKNOWN;
}

export const getCity = (location) => resolve(location, "city");
export const getRegion = (location) => resolve(location, "region");
export const getCountry = (location) => resolve(location, "country");
