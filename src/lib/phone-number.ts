import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
  type PhoneNumber
} from 'libphonenumber-js/max';

const countryNames = new Intl.DisplayNames(['uk'], { type: 'region' });

function phoneInput(value: string): string {
  return value.trim().replace(/^00/, '+');
}

export function parseCustomerPhone(value: string): PhoneNumber | undefined {
  const input = phoneInput(value);
  if (input.length > 40 || !/^\+?[\d\s().-]+$/.test(input)) return undefined;
  return parsePhoneNumberFromString(input, { defaultCountry: 'UA', extract: false });
}

export function phoneNumberError(value: string): string | undefined {
  if (!value.trim()) return 'Вкажіть телефон';
  if (!parseCustomerPhone(value)?.isValid())
    return 'Вкажіть коректний номер. Для інших країн додайте міжнародний код із +.';
  return undefined;
}

export function formatCustomerPhone(value: string): string {
  const number = parseCustomerPhone(value);
  return number?.isValid() ? number.formatInternational() : value;
}

export interface PhoneCountryInfo {
  country?: CountryCode;
  callingCode?: string;
  label: string;
}

export function phoneCountryInfo(value: string): PhoneCountryInfo {
  const input = phoneInput(value);
  if (!input) return { label: 'Український номер або міжнародний номер із +кодом країни.' };
  if (!/^\+?[\d\s().-]*$/.test(input)) return { label: 'Введіть номер телефону без літер.' };
  const formatter = new AsYouType('UA');
  formatter.input(input);
  const country = formatter.getCountry();
  const callingCode =
    formatter.getCallingCode() ?? (country ? getCountryCallingCode(country) : undefined);
  if (country)
    return {
      country,
      callingCode,
      label: `${countryNames.of(country) ?? country} · +${callingCode}`
    };
  if (callingCode) {
    const shared = getCountries().some((code) => getCountryCallingCode(code) === callingCode);
    return {
      callingCode,
      label: shared
        ? `+${callingCode} · Спільний код кількох країн. Продовжуйте введення.`
        : `+${callingCode} · Міжнародний телефонний код.`
    };
  }
  return { label: 'Введіть міжнародний код країни, наприклад +380.' };
}

export function phoneCountryFlag(country: CountryCode): string {
  return String.fromCodePoint(...[...country].map((character) => 127397 + character.charCodeAt(0)));
}
