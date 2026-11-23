/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		/** Preview-context van dit request; gezet door de middleware. */
		preview: import('./lib/preview').PreviewContext;
	}
}
