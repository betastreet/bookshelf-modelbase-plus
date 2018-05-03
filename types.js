/**
 * @typedef {{
 *   Model: {
 *     prefixedUuidToBinary?: function(pouuid: string, prefixLength: number),
 *     binaryToPrefixedUuid?: function(binary: Buffer, prefixLength: number),
 *     generateUuid?: function(prefix: string),
 *   },
 *   transaction: function(cb: Function),
 *   knex: *,
 * }} Bookshelf
 *
 */
