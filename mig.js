const log = require('../logger/log.js');
const httpStatus = require('http-status');
const { Op } = require('sequelize');
const { TEMPLATE_STATUS } = require('../config/enums');
const { Organization, Template, TemplateAccess, PartnerTemplate } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { template } = require('lodash');

/**
 * create Template
 * @param {Body} templateBody
 * @returns {Promise<Template>}
 */
const create = async (req) => {
  const { body } = req;
  const { issuerId } = body;

  const organization = await Organization.getById(issuerId);

  if (!organization) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Organization does not already exist');
  }

  const template = await Template.create(body);

  return template;
};

/**
 * get Template
 * @param {ObjectId} templateId
 * @returns {Promise<Template>}
 */
const getById = async (id) => {
  const template = await Template.findOne({
    where: { id },
    include: [
      {
        model: Organization,
        as: 'organization',
        attributes: ['id', 'logo', 'fullName', 'name'],
      },
    ],
  });

  if (!template) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Template Does not exist');
  }

  return template;
};

/**
 * update Template
 * @param {ObjectId} templateId
 * @param {Body} TemplateBody
 * @returns {Promise<Template>}
 */
const updateById = async (id, body) => {
  const template = await Template.getById(id);
  const { issuerId } = body;

  if (!template) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Template Does not exist');
  }

  const organization = await Organization.getById(issuerId);

  if (!organization) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Organization does not exist');
  }

  await Template.update({ ...body }, { where: { id } });
  return true;
};

/**
 * list Templates
 * @returns {Promise<Templates[]>}
 */
const list = async (req) => {
  const { partner } = req;
  const templatesAccess = await TemplateAccess.findAll({
    where: {
      partnerId: partner.id,
      templateType: 'FIXED_DEPOSIT',
    },
    raw: true,
  });
  const templateIds = templatesAccess.map((temp) => temp.templateId);

  const partnerTemplates = await PartnerTemplate.findAll({
    where: {
      partnerId: partner?.id,
      templateId: { [Op.in]: templateIds },
      status: TEMPLATE_STATUS.ACTIVE,
    },
    include: [
      {
        model: Organization,
        as: 'organization',
        attributes: ['id', 'name', 'logo', 'fullName'],
      },
    ],
    order: [['createdAt', 'ASC']],
  });

  const partnerTemplateIds = partnerTemplates.map((pt) => pt.templateId);

  // Fetch default templates for any that are missing from PartnerTemplates
  const missingTemplateIds = templateIds.filter((id) => !partnerTemplateIds.includes(id));
  let defaultTemplates = [];
  if (missingTemplateIds.length > 0) {
    defaultTemplates = await Template.findAll({
      where: {
        status: TEMPLATE_STATUS.ACTIVE,
        id: { [Op.in]: missingTemplateIds },
      },
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'logo', 'fullName'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });
  }

  const mappedPartnerTemplates = partnerTemplates.map((pt) => {
    const plain = pt.get({ plain: true });
    plain.id = plain.templateId;
    return plain;
  });

  const allTemplates = [...mappedPartnerTemplates, ...defaultTemplates.map((t) => t.get({ plain: true }))];
  const isIOS = req.headers['x-device'] === 'ios';

  return allTemplates.map((plain) => {
    plain.aboutIssuer = plain.aboutIssuer || {};
    plain.aboutIssuer.isBannerForNominee = plain.aboutIssuer.isBannerForNominee || {};

    if (isIOS) {
      plain.aboutIssuer.isBannerForNominee.isBannerVisible = false;
    }

    return plain;
  });
};

/**
 * Add Partner Template Access
 * @param {Body} templateBody
 * @returns {Promise<Template>}
 */
const addTemplateAccess = async (req) => {
  log.info('addTemplateAccess body', req.body);
  const { partnerId, templates } = req.body;

  for (const template of templates) {
    await TemplateAccess.create({
      partnerId,
      templateId: template.id,
      templateType: 'FIXED_DEPOSIT',
      status: 'ACTIVE',
    });
  }

  return true;
};

/**
 * Update Partner Template Access
 * @param {Body} templateBody
 * @returns {Promise<Template>}
 */
const updateTemplateAccess = async (req) => {
  log.info('updateTemplateAccess body', req.body);
  const { partnerId, templates } = req.body;

  await TemplateAccess.destroy({
    where: {
      partnerId,
    },
  });

  for (const template of templates) {
    await TemplateAccess.create({
      partnerId,
      templateId: template.id,
      templateType: 'FIXED_DEPOSIT',
      status: 'ACTIVE',
    });
  }

  return true;
};

/**
 * Add Partner Template Access
 * @param {Body} templateBody
 * @returns {Promise<Template>}
 */
const listPartnerTemplates = async (partnerId) => {
  const templates = await TemplateAccess.findAll({
    where: {
      partnerId,
    },
    attributes: ['id', 'templateId'],
    include: [
      {
        model: Template,
        as: 'template',
        attributes: ['id', 'displayName'],
      },
    ],
  });

  return templates.map((temp) => temp?.template);
};

/**
 * list Templates
 * @returns {Promise<Templates[]>}
 */
const templateListForDashboard = async () => {
  const templates = await Template.findAll({
    where: {
      status: TEMPLATE_STATUS.ACTIVE,
    },
    attributes: ['id', 'displayName'],
  });

  return templates;
};

const TENURE_BUCKETS = [
  { label: '7 Days - 90 Days', minTenure: 7, maxTenure: 90 },
  { label: '91 Days - 365 Days', minTenure: 91, maxTenure: 365 },
  { label: '366 Days - 730 Days', minTenure: 366, maxTenure: 730 },
  { label: '731 Days - 1095 Days', minTenure: 731, maxTenure: 1095 },
  { label: '1096 Days - 1825 Days', minTenure: 1096, maxTenure: 1825 },
];

const QUICK_PICK_LABELS = ['Ultra short-term', 'Short-term', 'Medium-term', 'Long-term', 'Extended'];

const { REFERENCE_BANKS } = require('./reference-banks.cjs');

/**
 * Compare interest rates across banks
 * @param {Object} req
 * @returns {Promise<Object>} comparison data with tenure buckets and bank rates
 */
const compareRates = async (req) => {
  const { partner } = req;

  const templatesAccess = await TemplateAccess.findAll({
    where: {
      partnerId: partner?.id,
      templateType: 'FIXED_DEPOSIT',
    },
    raw: true,
  });
  const templateIds = templatesAccess.map((temp) => temp?.templateId);

  const partnerTemplates = await PartnerTemplate.findAll({
    where: {
      partnerId: partner?.id,
      templateId: { [Op.in]: templateIds },
      status: TEMPLATE_STATUS.ACTIVE,
    },
    include: [
      {
        model: Organization,
        as: 'organization',
        attributes: ['id', 'name', 'logo', 'fullName'],
      },
    ],
    order: [['createdAt', 'ASC']],
  });

  const partnerTemplateIds = partnerTemplates.map((pt) => pt?.templateId);
  const missingTemplateIds = templateIds.filter((id) => !partnerTemplateIds.includes(id));
  let defaultTemplates = [];
  if (missingTemplateIds.length > 0) {
    defaultTemplates = await Template.findAll({
      where: {
        status: TEMPLATE_STATUS.ACTIVE,
        id: { [Op.in]: missingTemplateIds },
      },
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'logo', 'fullName'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });
  }

  const mappedPartnerTemplates = partnerTemplates.map((pt) => {
    const plain = pt.get({ plain: true });
    plain.id = plain.templateId;
    return plain;
  });

  const allTemplates = [...mappedPartnerTemplates, ...defaultTemplates.map((t) => t.get({ plain: true }))];

  const banks = allTemplates.map((tmpl) => {
    const frequencyMapping = tmpl.frequencyTenureMapping || [];
    const generalMapping = frequencyMapping.find((f) => f.frequency === 'CUMULATIVE' && !f.isSeniorCitizen);
    const seniorMapping = frequencyMapping.find((f) => f.frequency === 'CUMULATIVE' && f.isSeniorCitizen);
    const generalTenures = generalMapping?.tenure_mapping || [];
    const seniorTenures = seniorMapping?.tenure_mapping || [];

    const bucketRates = TENURE_BUCKETS.map((bucket) => {
      const entriesInBucket = generalTenures.filter((t) => t.tenure >= bucket.minTenure && t.tenure <= bucket.maxTenure);
      const maxRate = entriesInBucket.length > 0 ? Math.max(...entriesInBucket.map((e) => parseFloat(e.rates))) : null;

      const seniorEntries = seniorTenures.filter((t) => t.tenure >= bucket.minTenure && t.tenure <= bucket.maxTenure);
      const seniorMaxRate = seniorEntries.length > 0 ? Math.max(...seniorEntries.map((e) => parseFloat(e.rates))) : null;

      return {
        label: bucket.label,
        rate: maxRate,
        seniorCitizenRate: seniorMaxRate,
      };
    });

    const validRates = bucketRates.filter((b) => b.rate !== null).map((b) => b.rate);
    const peakRate = validRates.length > 0 ? Math.max(...validRates) : null;

    return {
      templateId: tmpl.id,
      displayName: tmpl.displayName,
      organization: tmpl.organization,
      peakRate,
      bucketRates,
    };
  });

  const referenceBankKey =
    req.query?.referenceBank && REFERENCE_BANKS[req.query.referenceBank] ? req.query.referenceBank : 'SBI';
  const referenceBankSource = REFERENCE_BANKS[referenceBankKey];
  const referenceBank = {
    name: referenceBankSource.name,
    peakRate: referenceBankSource.peakRate,
    bucketRates: TENURE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      rate: referenceBankSource.rates[bucket.label] ?? null,
    })),
  };

  const tenureBuckets = TENURE_BUCKETS.map((bucket, index) => {
    const partnerRates = banks.map((bank) => bank.bucketRates[index].rate).filter((r) => r !== null);
    const refRate = referenceBank.bucketRates[index].rate;
    const allRates = refRate !== null ? [...partnerRates, refRate] : partnerRates;
    const bestRate = allRates.length > 0 ? Math.max(...allRates) : null;
    return {
      label: bucket.label,
      minTenure: bucket.minTenure,
      maxTenure: bucket.maxTenure,
      bestRate,
    };
  });

  let bestDealIndex = -1;
  let highestBestRate = 0;
  tenureBuckets.forEach((bucket, index) => {
    if (bucket.bestRate !== null && bucket.bestRate > highestBestRate) {
      highestBestRate = bucket.bestRate;
      bestDealIndex = index;
    }
  });

  const quickPicks = TENURE_BUCKETS.map((bucket, index) => {
    const bucketBestRate = tenureBuckets[index].bestRate;
    const winners = banks.filter(
      (bank) => bank.bucketRates[index].rate !== null && bank.bucketRates[index].rate === bucketBestRate,
    );

    return {
      label: QUICK_PICK_LABELS[index] || bucket.label,
      tenureRange: bucket.label,
      minTenure: bucket.minTenure,
      maxTenure: bucket.maxTenure,
      rate: bucketBestRate,
      bankNames: winners.map((w) => w.organization?.fullName || w.displayName),
      templateId: winners[0]?.templateId || null,
      isBestDeal: index === bestDealIndex,
    };
  });

  const taxSaverEntries = allTemplates
    .map((tmpl) => {
      const frequencyMapping = tmpl.frequencyTenureMapping || [];
      const generalMapping = frequencyMapping.find((f) => f.frequency === 'CUMULATIVE' && !f.isSeniorCitizen);
      const taxSaverEntry = (generalMapping?.tenure_mapping || []).find((t) => t.tenure === 1826 && t.taxSaver === true);
      if (!taxSaverEntry) return null;
      return {
        templateId: tmpl.id,
        displayName: tmpl.displayName,
        organization: tmpl.organization,
        rate: parseFloat(taxSaverEntry.rates),
      };
    })
    .filter((t) => t !== null);

  if (taxSaverEntries.length > 0) {
    const maxSafetyRate = Math.max(...taxSaverEntries.map((t) => t.rate));
    const maxSafetyWinners = taxSaverEntries.filter((t) => t.rate === maxSafetyRate);

    quickPicks.push({
      label: 'Max Safety',
      tenureRange: '5 Years (Tax Saver)',
      minTenure: 1826,
      maxTenure: 1826,
      rate: maxSafetyRate,
      bankNames: maxSafetyWinners.map((w) => w.organization?.fullName || w.displayName),
      templateId: maxSafetyWinners[0]?.templateId || null,
      isBestDeal: false,
    });
  }

  return {
    availableReferenceBanks: Object.keys(REFERENCE_BANKS),
    referenceBank,
    tenureBuckets: tenureBuckets.map((bucket, index) => ({
      ...bucket,
      isBestDeal: index === bestDealIndex,
    })),
    banks,
    quickPicks,
  };
};

module.exports = {
  create,
  getById,
  updateById,
  list,
  addTemplateAccess,
  templateListForDashboard,
  addTemplateAccess,
  listPartnerTemplates,
  updateTemplateAccess,
  compareRates,
};
