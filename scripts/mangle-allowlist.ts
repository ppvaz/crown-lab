
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const srcDir = join(root, 'src');
let cachedAllowlist: MangleAllowlist | null = null;

const SERIALIZED_ROOTS: Readonly<Record<string, readonly string[]>> = {
  'src/lab/telemetry.ts': ['RunRecord', 'RunMeta', 'OperatorMeta', 'ParsedRun'],
  'src/lab/content.ts': ['EncounterContent'],
  'src/net/lockstep.ts': ['NetMessage'],
  'src/net/channel.ts': [
    'ClientMessage',
    'ServerMessage',
    'SessionDescriptionInit',
    'IceCandidateInit',
    'IceServerConfig',
    'SocketLike',
    'DataChannelLike',
    'PeerConnectionLike',
  ],
  'src/app/prefs.ts': ['StoredSelections'],
};

const CONTENT_ROOMS = 'src/lab/rooms';

export interface MangleExclusion {
  readonly name: string;
  readonly rule: string;
  readonly where: string;
}

export interface MangleAllowlist {
  readonly names: readonly string[];
  readonly declared: number;
  readonly exclusions: readonly MangleExclusion[];
}

const filesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });

const memberName = (node: ts.Node): string | null => {
  const name = (node as { name?: ts.Node }).name;
  if (name === undefined) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return null;
};

const isMemberDeclaration = (node: ts.Node): boolean =>
  ts.isPropertySignature(node) ||
  ts.isMethodSignature(node) ||
  ts.isPropertyDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) ||
  ts.isEnumMember(node);

const isPlainIdentifier = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

export const derivePublicMangleAllowlist = (): MangleAllowlist => {
  if (cachedAllowlist !== null) return cachedAllowlist;
  const sources = filesUnder(srcDir).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.d.ts'),
  );
  const config = ts.parseJsonConfigFileContent(
    ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile).config,
    ts.sys,
    root,
  );
  const program = ts.createProgram(sources, { ...config.options, noEmit: true });
  const checker = program.getTypeChecker();
  const inSrc = (file: ts.SourceFile): boolean => file.fileName.startsWith(srcDir);
  const isProject = (file: ts.SourceFile): boolean => inSrc(file) && !file.isDeclarationFile;
  const relative = (file: ts.SourceFile): string => file.fileName.slice(root.length + 1);

  const exclusions: MangleExclusion[] = [];
  const excluded = new Map<string, MangleExclusion>();
  const exclude = (name: string, rule: string, where: string): void => {
    const record = { name, rule, where };
    exclusions.push(record);
    if (!excluded.has(name)) excluded.set(name, record);
  };

  const declared = new Map<string, string>();
  for (const file of program.getSourceFiles()) {
    if (!isProject(file)) continue;
    const where = relative(file);
    const walk = (node: ts.Node): void => {
      if (isMemberDeclaration(node)) {
        const name = memberName(node);
        if (name !== null && !declared.has(name)) declared.set(name, where);
      }
      ts.forEachChild(node, walk);
    };
    ts.forEachChild(file, walk);
  }

  for (const file of program.getSourceFiles()) {
    if (inSrc(file)) continue;
    const where = file.fileName.replace(/^.*\/node_modules\//, '');
    const walk = (node: ts.Node): void => {
      if (isMemberDeclaration(node)) {
        const name = memberName(node);
        if (name !== null && declared.has(name)) exclude(name, 'platform', where);
      }
      ts.forEachChild(node, walk);
    };
    ts.forEachChild(file, walk);
  }

  const visitedTypes = new Set<string>();
  const collectSerialized = (type: ts.Type | undefined, where: string, depth = 0): void => {
    if (type === undefined || depth > 12) return;
    const key = `${(type as ts.Type & { id?: number }).id ?? ''}|${where}`;
    if (visitedTypes.has(key)) return;
    visitedTypes.add(key);
    if (type.isUnionOrIntersection()) {
      for (const member of type.types) collectSerialized(member, where, depth + 1);
      return;
    }
    for (const argument of checker.getTypeArguments(type as ts.TypeReference) ?? []) {
      collectSerialized(argument, where, depth + 1);
    }
    for (const property of checker.getPropertiesOfType(type)) {
      const name = property.getName();
      if (declared.has(name)) exclude(name, 'serialized', where);
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (declaration !== undefined) {
        collectSerialized(
          checker.getTypeOfSymbolAtLocation(property, declaration),
          where,
          depth + 1,
        );
      }
    }
  };
  for (const file of program.getSourceFiles()) {
    if (!isProject(file)) continue;
    const roots = SERIALIZED_ROOTS[relative(file)];
    if (roots === undefined) continue;
    const found = new Set<string>();
    for (const statement of file.statements) {
      if (
        !(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) ||
        statement.name === undefined
      ) {
        continue;
      }
      if (!roots.includes(statement.name.text)) continue;
      found.add(statement.name.text);
      const symbol = checker.getSymbolAtLocation(statement.name);
      if (symbol !== undefined) {
        collectSerialized(checker.getDeclaredTypeOfSymbol(symbol), relative(file));
      }
    }
    for (const name of roots) {
      if (!found.has(name)) {
        throw new Error(
          `mangle allow-list: serialized root ${name} is not declared in ${relative(file)}`,
        );
      }
    }
  }
  {
    let source = CONTENT_ROOMS;
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          if (declared.has(key)) exclude(key, 'serialized', source);
          walk(nested);
        }
      }
    };
    for (const name of readdirSync(join(root, CONTENT_ROOMS))) {
      if (!name.endsWith('.json')) continue;
      source = `${CONTENT_ROOMS}/${name}`;
      walk(JSON.parse(readFileSync(join(root, CONTENT_ROOMS, name), 'utf8')));
    }
  }

  const literalKeysOf = (type: ts.Type): string[] | null => {
    const keys: string[] = [];
    const visit = (member: ts.Type): boolean => {
      if (member.isUnion()) return member.types.every(visit);
      if (member.isStringLiteral()) {
        keys.push(member.value);
        return true;
      }
      return false;
    };
    return visit(type) ? keys : null;
  };
  const excludeAllPropertiesOf = (expression: ts.Expression, rule: string, where: string): void => {
    const apparent = checker.getApparentType(
      checker.getNonNullableType(checker.getTypeAtLocation(expression)),
    );
    const visit = (type: ts.Type, depth = 0): void => {
      if (depth > 2) return;
      if (type.isUnionOrIntersection()) {
        for (const member of type.types) visit(member, depth);
        return;
      }
      for (const property of checker.getPropertiesOfType(type)) {
        if (declared.has(property.getName())) exclude(property.getName(), rule, where);
      }
    };
    visit(apparent);
  };
  const isBag = (type: ts.Type | undefined): boolean => {
    if (type === undefined) return false;
    if ((type.flags & ts.TypeFlags.Any) !== 0) return true;
    return hasStringIndex(type);
  };
  const hasStringIndex = (type: ts.Type | undefined): boolean => {
    if (type === undefined) return false;
    if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return false;
    const nonNull = checker.getNonNullableType(type);
    if (nonNull.isUnionOrIntersection()) return nonNull.types.some(hasStringIndex);
    return checker.getIndexInfoOfType(nonNull, ts.IndexKind.String) !== undefined;
  };
  const ENUMERATORS = new Set([
    'keys',
    'entries',
    'fromEntries',
    'getOwnPropertyNames',
    'stringify',
  ]);

  for (const file of program.getSourceFiles()) {
    if (!isProject(file)) continue;
    const rel = relative(file);
    const at = (node: ts.Node): string =>
      `${rel}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`;
    const walk = (node: ts.Node): void => {
      if (ts.isElementAccessExpression(node)) {
        const argument = node.argumentExpression;
        const isStaticName =
          ts.isStringLiteral(argument) ||
          ts.isNoSubstitutionTemplateLiteral(argument) ||
          ts.isNumericLiteral(argument);
        if (!isStaticName) {
          const keys = literalKeysOf(checker.getTypeAtLocation(argument));
          if (keys === null) excludeAllPropertiesOf(node.expression, 'dynamic', at(node));
          else for (const key of keys) if (declared.has(key)) exclude(key, 'dynamic', at(node));
        }
      }
      if (ts.isComputedPropertyName(node)) {
        const expression = node.expression;
        if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
          if (declared.has(expression.text)) exclude(expression.text, 'dynamic', at(node));
        } else {
          const keys = literalKeysOf(checker.getTypeAtLocation(expression));
          if (keys === null) {
            const owner = node.parent.parent;
            if (owner !== undefined && ts.isObjectLiteralExpression(owner)) {
              excludeAllPropertiesOf(owner, 'dynamic', at(node));
            }
          } else {
            for (const key of keys) if (declared.has(key)) exclude(key, 'dynamic', at(node));
          }
        }
      }
      if (ts.isForInStatement(node)) excludeAllPropertiesOf(node.expression, 'dynamic', at(node));
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InKeyword) {
        if (ts.isStringLiteral(node.left)) {
          if (declared.has(node.left.text)) exclude(node.left.text, 'dynamic', at(node));
        } else excludeAllPropertiesOf(node.right, 'dynamic', at(node));
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const owner = node.expression.expression;
        if (
          ts.isIdentifier(owner) &&
          (owner.text === 'Object' || owner.text === 'JSON') &&
          ENUMERATORS.has(node.expression.name.text)
        ) {
          for (const argument of node.arguments) {
            excludeAllPropertiesOf(argument, 'dynamic', at(node));
          }
        }
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
        if (declared.has(node.name.text) && isBag(checker.getTypeAtLocation(node.expression))) {
          exclude(node.name.text, 'bag', at(node));
        }
      }
      if (ts.isObjectLiteralExpression(node) && hasStringIndex(checker.getContextualType(node))) {
        for (const property of node.properties) {
          const name = property.name;
          if (name === undefined || ts.isComputedPropertyName(name)) continue;
          const text = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
          if (text !== null && declared.has(text)) exclude(text, 'bag', at(node));
        }
      }
      ts.forEachChild(node, walk);
    };
    ts.forEachChild(file, walk);
  }

  for (const file of program.getSourceFiles()) {
    if (!isProject(file)) continue;
    const rel = relative(file);
    const walk = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const parent = node.parent;
        const isNameRatherThanValue =
          ts.isPropertyAssignment(parent) ||
          ts.isPropertySignature(parent) ||
          ts.isEnumMember(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isLiteralTypeNode(parent) ||
          ts.isImportDeclaration(parent) ||
          ts.isExportDeclaration(parent) ||
          (ts.isElementAccessExpression(parent) && parent.argumentExpression === node);
        if (!isNameRatherThanValue && declared.has(node.text)) {
          exclude(
            node.text,
            'literal',
            `${rel}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`,
          );
        }
      }
      ts.forEachChild(node, walk);
    };
    ts.forEachChild(file, walk);
  }

  const names = [...declared.keys()]
    .filter((name) => !excluded.has(name) && isPlainIdentifier(name))
    .sort();
  cachedAllowlist = { names, declared: declared.size, exclusions };
  return cachedAllowlist;
};

export const publicManglePattern = (): RegExp => {
  const { names } = derivePublicMangleAllowlist();
  if (names.length === 0) {
    throw new Error('mangle allow-list derived nothing — the deriver is broken, not the source');
  }
  return new RegExp(`^(?:${names.join('|')})$`);
};

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const { names, declared, exclusions } = derivePublicMangleAllowlist();
  const byRule = new Map<string, Set<string>>();
  const firstReason = new Map<string, MangleExclusion>();
  for (const exclusion of exclusions) {
    if (!byRule.has(exclusion.rule)) byRule.set(exclusion.rule, new Set());
    byRule.get(exclusion.rule)!.add(exclusion.name);
    if (!firstReason.has(exclusion.name)) firstReason.set(exclusion.name, exclusion);
  }
  console.log(`declared property names in src/: ${declared}`);
  for (const rule of ['platform', 'serialized', 'dynamic', 'bag', 'literal']) {
    console.log(`  excluded by ${rule}: ${byRule.get(rule)?.size ?? 0}`);
  }
  console.log(`mangleable: ${names.length}`);
  if (process.argv.includes('--names')) console.log(names.join(' '));
  if (process.argv.includes('--why')) {
    for (const [name, reason] of [...firstReason].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${name}\t${reason.rule}\t${reason.where}`);
    }
  }
}
