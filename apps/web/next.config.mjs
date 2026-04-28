/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@workspace/ui",
    "@loanscope/compare",
    "@loanscope/domain",
    "@loanscope/engine",
    "@loanscope/products",
    "@loanscope/config",
    "@loanscope/db",
    "@loanscope/lenders",
    "@loanscope/sim",
  ],
};

export default nextConfig;
