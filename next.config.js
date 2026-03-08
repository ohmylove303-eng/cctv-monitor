/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        config.resolve.fallback = { fs: false, net: false, tls: false };
        return config;
    },
    transpilePackages: ['maplibre-gl'],
};

module.exports = nextConfig;
