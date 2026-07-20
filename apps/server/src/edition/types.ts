export interface ServerProComposition {
  modules: readonly unknown[];
  start?: () => Promise<void> | void;
}
