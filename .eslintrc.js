module.exports = {
	env: {
		browser: true,
		commonjs: true,
		es2021: true,
	},
	extends: ["plugin:prettier/recommended"],
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module",
	},
	parser: "@typescript-eslint/parser",
	rules: {
		"prettier/prettier": 2,
	},
	plugins: ["prettier"],
};
