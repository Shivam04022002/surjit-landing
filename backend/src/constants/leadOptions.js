// The option values the lead form submits, and the only values the API
// accepts. The frontend mirrors these in src/forms/leadForm/leadFormConfig.js;
// a change here must be made there too.
//
// `averageMonthlySale` values come from the original form reference. The other
// value sets were defined for this build because the reference values were not
// available — reconcile them with any downstream system before it consumes
// leads.

const USE_OF_FUNDS = {
    'business-expansion': 'Business Expansion',
    inventory: 'Inventory',
    machinery: 'Machinery',
    'working-capital': 'Working Capital',
    'personal-use': 'Personal Use',
    other: 'Other'
};

const AVERAGE_MONTHLY_SALE = {
    '50k-1.5L': '₹50,000 – ₹1,50,000',
    '1.5L-3L': '₹1,50,000 – ₹3,00,000',
    '3L-5L': '₹3,00,000 – ₹5,00,000',
    '5L+': '₹5,00,000+'
};

const BUSINESS_VINTAGE = {
    'lt-1': 'Less than 1 year',
    '1-3': '1-3 years',
    '3-5': '3-5 years',
    '5+': '5+ years'
};

const CREDIT_SCORE = {
    'lt-550': 'Below 550',
    '550-650': '550-650',
    '650-750': '650-750',
    '750+': '750+'
};

const NAME_MAX_LENGTH = 100;

module.exports = {
    USE_OF_FUNDS,
    AVERAGE_MONTHLY_SALE,
    BUSINESS_VINTAGE,
    CREDIT_SCORE,
    NAME_MAX_LENGTH
};
