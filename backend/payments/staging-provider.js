if(process.env.APP_ENV!=='staging'||!/^staging_[a-z0-9_]+$/.test(process.env.STAGING_DATABASE_SCHEMA||'')||process.env.PUBLIC_APP_URL?.includes('://privacy-joice.vercel.app'))throw new Error('Staging payments require isolated staging configuration');
module.exports={...require('./mock-provider'),name:'staging'};
