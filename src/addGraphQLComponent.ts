import { InsertGraphQLComponentType } from "./extensionTypes";
import { capitalize, uncapitalize } from "./extensionUtils";
import { loadFullSchema } from "./loadSchema";

import { TextEditorEdit, window, Selection } from "vscode";

import {
  GraphQLSchema,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
} from "graphql";
import { makeFragment, makeOperation } from "./graphqlUtils";

async function getValidModuleName(
  docText: string,
  name: string
): Promise<string> {
  const newName = docText.includes(`module ${name} =`)
    ? await window.showInputBox({
        prompt: "Enter module name ('" + name + "' already exists in document)",
        validateInput: (v: string) =>
          v !== name ? null : "Name cannot be '" + name + "'.",
        value: name,
      })
    : null;

  return newName || name;
}

interface QuickPickFromSchemaResult {
  schemaPromise: Promise<GraphQLSchema | undefined>;
  result: Thenable<string | undefined>;
}

export function quickPickFromSchema(
  placeHolder: string | undefined,
  getItems: (schema: GraphQLSchema) => string[]
): QuickPickFromSchemaResult {
  const schemaPromise = loadFullSchema();

  return {
    schemaPromise,
    result: window.showQuickPick(
      schemaPromise.then((maybeSchema: GraphQLSchema | undefined) => {
        if (maybeSchema) {
          return getItems(maybeSchema);
        }

        return [];
      }),
      {
        placeHolder,
      }
    ),
  };
}

export async function addGraphQLComponent(type: InsertGraphQLComponentType) {
  const textEditor = window.activeTextEditor;

  if (!textEditor) {
    window.showErrorMessage("Missing active text editor.");
    return;
  }

  const docText = textEditor.document.getText();

  let insert = "";

  // TODO: Fix this, this is insane
  const moduleName = capitalize(
    (textEditor.document.fileName.split(/\\|\//).pop() || "")
      .split(".")
      .shift() || ""
  );

  switch (type) {
    case "Fragment": {
      const { result } = quickPickFromSchema(
        "Select type of the fragment",
        (s) =>
          Object.values(s.getTypeMap()).reduce(
            (acc: string[], curr: GraphQLNamedType) => {
              if (
                (curr instanceof GraphQLObjectType ||
                  curr instanceof GraphQLInterfaceType ||
                  curr instanceof GraphQLUnionType) &&
                !curr.name.startsWith("__")
              ) {
                acc.push(curr.name);
              }

              return acc;
            },
            []
          )
      );

      const onType = await result;

      if (!onType) {
        return;
      }

      const rModuleName = await getValidModuleName(
        docText,
        `${onType}Fragment`
      );

      insert += `module ${rModuleName} = %relay(\`\n  ${await makeFragment(
        `${moduleName}_${uncapitalize(rModuleName.replace("Fragment", ""))}`,
        onType
      )}\n\`\n)`;

      const shouldInsertComponentBoilerplate =
        (await window.showQuickPick(["Yes", "No"], {
          placeHolder: "Do you also want to add boilerplate for a component?",
        })) === "Yes";

      if (shouldInsertComponentBoilerplate) {
        insert += `\n\n
@react.component
let make = (~${uncapitalize(onType)}) => {
  let ${uncapitalize(onType)} = ${rModuleName}.use(${uncapitalize(onType)})

  React.null
}`;
      }
      break;
    }
    case "Query": {
      const { schemaPromise, result } = quickPickFromSchema(
        "Select root field",
        (s) => {
          const queryObj = s.getQueryType();
          if (queryObj) {
            return Object.keys(queryObj.getFields()).filter(
              (k) => !k.startsWith("__")
            );
          }

          return [];
        }
      );

      const query = await result;

      if (!query) {
        return;
      }

      const queryField = await schemaPromise.then((schema) => {
        if (schema) {
          const queryObj = schema.getQueryType();
          if (queryObj) {
            return queryObj.getFields()[query] || null;
          }
        }

        return null;
      });

      if (!queryField) {
        return;
      }

      const rModuleName = await getValidModuleName(docText, `Query`);

      insert += `module ${rModuleName} = %relay(\`\n  ${await makeOperation(
        "query",
        `${moduleName}${rModuleName}${
          rModuleName.endsWith("Query") ? "" : "Query"
        }`,
        queryField
      )}\n\`)`;

      const shouldInsertComponentBoilerplate =
        (await window.showQuickPick(["Yes", "No"], {
          placeHolder: "Do you also want to add boilerplate for a component?",
        })) === "Yes";

      if (shouldInsertComponentBoilerplate) {
        const typeOfQuery = await window.showQuickPick(["Preloaded", "Lazy"], {
          placeHolder: "What type of query are you making?",
        });

        insert += `\n\n
@react.component
let make = (${typeOfQuery === "Preloaded" ? "~queryRef" : ""}) => {
  ${
    typeOfQuery === "Preloaded"
      ? `let data = ${rModuleName}.usePreloaded(~queryRef, ())`
      : `let data = ${rModuleName}.use(~variables=(), ())`
  }

  React.null
}`;
      }
      break;
    }
    case "Mutation": {
      const { schemaPromise, result } = quickPickFromSchema(
        "Select mutation",
        (s) => {
          const mutationObj = s.getMutationType();
          if (mutationObj) {
            return Object.keys(mutationObj.getFields()).filter(
              (k) => !k.startsWith("__")
            );
          }

          return [];
        }
      );

      const mutation = await result;

      if (!mutation) {
        return;
      }

      const mutationField = await schemaPromise.then((schema) => {
        if (schema) {
          const mutationObj = schema.getMutationType();
          if (mutationObj) {
            return mutationObj.getFields()[mutation] || null;
          }
        }

        return null;
      });

      if (!mutationField) {
        return;
      }

      const rModuleName = await getValidModuleName(
        docText,
        `${capitalize(mutation)}Mutation`
      );

      insert += `module ${rModuleName} = %relay(\`\n  ${await makeOperation(
        "mutation",
        `${moduleName}_${capitalize(mutation)}Mutation`,
        mutationField
      )}\n\`)`;

      const shouldInsertComponentBoilerplate =
        (await window.showQuickPick(["Yes", "No"], {
          placeHolder: "Do you also want to add boilerplate for a component?",
        })) === "Yes";

      if (shouldInsertComponentBoilerplate) {
        insert += `\n\n
@react.component
let make = () => {
  let (mutate, isMutating) = ${rModuleName}.use()

  React.null
}`;
      }
      break;
    }

    case "Subscription": {
      const { schemaPromise, result } = quickPickFromSchema(
        "Select subscription",
        (s) => {
          const subscriptionObj = s.getSubscriptionType();
          if (subscriptionObj) {
            return Object.keys(subscriptionObj.getFields()).filter(
              (k) => !k.startsWith("__")
            );
          }

          return [];
        }
      );

      const subscription = await result;

      if (!subscription) {
        return;
      }

      const subscriptionField = await schemaPromise.then((schema) => {
        if (schema) {
          const subscriptionObj = schema.getSubscriptionType();
          if (subscriptionObj) {
            return subscriptionObj.getFields()[subscription] || null;
          }
        }

        return null;
      });

      if (!subscriptionField) {
        return;
      }

      const rModuleName = await getValidModuleName(docText, `Subscription`);

      insert += `module ${rModuleName} = %relay(\`\n  ${await makeOperation(
        "subscription",
        `${moduleName}_${capitalize(subscription)}Subscription`,
        subscriptionField
      )}\n\`)`;

      const shouldInsertComponentBoilerplate =
        (await window.showQuickPick(["Yes", "No"], {
          placeHolder: "Do you also want to add boilerplate for a component?",
        })) === "Yes";

      if (shouldInsertComponentBoilerplate) {
        insert += `\n\n
@react.component
let make = () => {
  let environment = ReasonRelay.useEnvironmentFromContext()

  React.useEffect0(() => {
    let subscription = ${rModuleName}.subscribe(
      ~environment,
      ~variables=(),
      (),
    )

    Some(() => ReasonRelay.Disposable.dispose(subscription))
  })

  React.null
}`;
      }
      break;
    }
  }

  await textEditor.edit((editBuilder: TextEditorEdit) => {
    const textDocument = textEditor.document;

    if (!textDocument) {
      return;
    }

    editBuilder.insert(textEditor.selection.active, insert);
  });

  const currentPos = textEditor.selection.active;
  const newPos = currentPos.with(currentPos.line - 3);

  textEditor.selection = new Selection(newPos, newPos);

  const textDocument = textEditor.document;

  if (!textDocument) {
    return;
  }

  await textDocument.save();

  let edited: boolean | undefined = false;

  if (edited) {
    await textDocument.save();
  }
}
