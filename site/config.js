// Client-safe config only; never put an owner UUID or service-role secret here.
// Github Actions renders these public fields on release. Missing config fails closed.
window.DRIVMATCH_STREAM_CONFIG = Object.freeze({supabaseUrl:"",supabaseAnonKey:""});
