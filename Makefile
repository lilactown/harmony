test:
	npx jest

compile_build:
	tsc build.ts

run_build: build.js
	node build.js
