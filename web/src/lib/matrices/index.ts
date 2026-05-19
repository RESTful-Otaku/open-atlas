/**
 * Matrix module barrel — prefer `./catalog` or direct imports from route
 * loaders to avoid pulling the full catalog when only `MatrixView` is needed.
 */
export {
  MATRIX_CATALOG,
  matrixById,
  type MatrixCatalogEntry,
} from "./catalog";
export { default as MatrixView } from "./MatrixView.svelte";
