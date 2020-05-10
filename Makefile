build: build.js node_modules
	node build.js

node_modules: package.json
	npm install
  # this updates mtime of dir which make uses to determine if it's out of date
	touch -m node_modules

test: node_modules
	npx jest

build.js: build.ts
	tsc build.ts
