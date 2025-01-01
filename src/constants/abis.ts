// Basic DRC20 ABI for token interactions
export const DRC20_ABI = [
  'constructor()',
  'function initialize(string memory name_, string memory symbol_, uint256 totalSupply_, address creator_) external',
  'function totalSupply() external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function balanceOf(address account) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
  'function owner() external view returns (address)',
  'function renounceOwnership() external'
];
