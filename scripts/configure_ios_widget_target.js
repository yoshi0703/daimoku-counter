const fs = require("fs");
const path = require("path");
const xcode = require("xcode");

const projectPath = path.join(__dirname, "..", "ios", "app.xcodeproj", "project.pbxproj");
const project = xcode.project(projectPath);
project.parseSync();

const objects = project.hash.project.objects;
objects.PBXTargetDependency = objects.PBXTargetDependency || {};
objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

const quote = (value) => `"${String(value).replace(/^"|"$/g, "")}"`;
const unquote = (value) => String(value || "").replace(/^"|"$/g, "");

function findTargetKeyByName(name) {
  const normalized = unquote(name);
  const section = project.pbxNativeTargetSection();
  for (const key of Object.keys(section)) {
    if (key.endsWith("_comment")) continue;
    if (unquote(section[key].name) === normalized) {
      return key;
    }
  }
  return null;
}

function ensureGroup(name, groupPath) {
  const section = objects.PBXGroup || {};
  for (const key of Object.keys(section)) {
    if (key.endsWith("_comment")) continue;
    const group = section[key];
    if (unquote(group.name) === name && unquote(group.path || "") === groupPath) {
      return key;
    }
  }

  const key = project.pbxCreateGroup(name, groupPath);
  const mainGroup = project.getFirstProject().firstProject.mainGroup;
  project.addToPbxGroup(key, mainGroup);
  return key;
}

function ensureBuildPhase(targetKey, isa, comment) {
  const target = objects.PBXNativeTarget[targetKey];
  const has = (target.buildPhases || []).some((phase) => phase.comment === comment);
  if (!has) {
    project.addBuildPhase([], isa, comment, targetKey);
  }

  const phaseRef = objects.PBXNativeTarget[targetKey].buildPhases.find((phase) => phase.comment === comment);
  return phaseRef ? phaseRef.value : null;
}

function findFileRefByPath(filePath) {
  const normalized = unquote(filePath);
  const section = objects.PBXFileReference || {};
  for (const key of Object.keys(section)) {
    if (key.endsWith("_comment")) continue;
    const file = section[key];
    if (unquote(file.path) === normalized) {
      return key;
    }
  }
  return null;
}

function ensureFileReference(filePath, groupKey) {
  let fileRef = findFileRefByPath(filePath);
  if (!fileRef) {
    const file = project.addFile(filePath, groupKey);
    fileRef = file?.fileRef || findFileRefByPath(filePath);
  }

  if (!fileRef) {
    throw new Error(`Unable to create file reference for ${filePath}`);
  }

  const group = objects.PBXGroup[groupKey];
  const hasChild = (group.children || []).some((child) => child.value === fileRef);
  if (!hasChild) {
    group.children.push({
      value: fileRef,
      comment: path.basename(filePath),
    });
  }

  return fileRef;
}

function ensureSourceMembership(filePath, targetKey, groupKey) {
  const fileRef = ensureFileReference(filePath, groupKey);
  const phaseKey = ensureBuildPhase(targetKey, "PBXSourcesBuildPhase", "Sources");
  if (!phaseKey) throw new Error(`Missing Sources phase for target ${targetKey}`);

  const phase = objects.PBXSourcesBuildPhase[phaseKey];
  const basename = path.basename(filePath);
  const comment = `${basename} in Sources`;
  const has = (phase.files || []).some((entry) => {
    const buildFile = objects.PBXBuildFile[entry.value];
    return buildFile?.fileRef === fileRef;
  });
  if (has) return;

  const buildFileUuid = project.generateUuid();
  objects.PBXBuildFile[buildFileUuid] = {
    isa: "PBXBuildFile",
    fileRef,
    fileRef_comment: basename,
  };
  objects.PBXBuildFile[`${buildFileUuid}_comment`] = comment;

  phase.files.push({
    value: buildFileUuid,
    comment,
  });
}

function removeSourceMembership(filePath, targetKey) {
  const fileRef = findFileRefByPath(filePath);
  if (!fileRef) return;

  const phaseRef = (objects.PBXNativeTarget[targetKey].buildPhases || []).find((phase) => phase.comment === "Sources");
  if (!phaseRef) return;

  const phase = objects.PBXSourcesBuildPhase[phaseRef.value];
  if (!phase?.files) return;

  const remaining = [];

  for (const entry of phase.files) {
    const buildFile = objects.PBXBuildFile[entry.value];
    if (buildFile?.fileRef !== fileRef) {
      remaining.push(entry);
      continue;
    }

    delete objects.PBXBuildFile[entry.value];
    delete objects.PBXBuildFile[`${entry.value}_comment`];
  }

  phase.files = remaining;
}

function hasTargetDependency(fromTargetKey, toTargetKey) {
  const dependencies = objects.PBXNativeTarget[fromTargetKey].dependencies || [];
  for (const dependency of dependencies) {
    const depObj = objects.PBXTargetDependency[dependency.value];
    if (depObj?.target === toTargetKey) return true;
  }
  return false;
}

function applyWidgetBuildSettings(targetKey) {
  const target = objects.PBXNativeTarget[targetKey];
  const configList = objects.XCConfigurationList[target.buildConfigurationList];
  for (const configRef of configList.buildConfigurations) {
    const config = objects.XCBuildConfiguration[configRef.value];
    const settings = config.buildSettings || {};

    settings.INFOPLIST_FILE = quote("DaimokuWidgetExtension/Info.plist");
    settings.CODE_SIGN_ENTITLEMENTS = quote("DaimokuWidgetExtension/DaimokuWidgetExtension.entitlements");
    settings.IPHONEOS_DEPLOYMENT_TARGET = "16.1";
    settings.SWIFT_VERSION = "5.0";
    settings.PRODUCT_NAME = quote("DaimokuWidgetExtension");
    settings.PRODUCT_BUNDLE_IDENTIFIER = quote("com.yoshi0703.daimokucounter.widget");
    settings.TARGETED_DEVICE_FAMILY = "1";
    settings.SKIP_INSTALL = "YES";
    settings.APPLICATION_EXTENSION_API_ONLY = "YES";
    settings.GENERATE_INFOPLIST_FILE = "NO";

    config.buildSettings = settings;
  }
}

const appTargetKey = findTargetKeyByName("app");
if (!appTargetKey) throw new Error("Unable to find app target");

let widgetTargetKey = findTargetKeyByName("DaimokuWidgetExtension");
if (!widgetTargetKey) {
  const target = project.addTarget(
    "DaimokuWidgetExtension",
    "app_extension",
    "DaimokuWidgetExtension",
    "com.yoshi0703.daimokucounter.widget"
  );
  widgetTargetKey = target.uuid;
}

// Normalize widget target naming/comments.
objects.PBXNativeTarget[widgetTargetKey].name = quote("DaimokuWidgetExtension");
objects.PBXNativeTarget[widgetTargetKey].productName = quote("DaimokuWidgetExtension");
objects.PBXNativeTarget[`${widgetTargetKey}_comment`] = "DaimokuWidgetExtension";

const projectTargets = project.getFirstProject().firstProject.targets;
for (const entry of projectTargets) {
  if (entry.value === widgetTargetKey) {
    entry.comment = "DaimokuWidgetExtension";
  }
}

const appGroupKey = project.findPBXGroupKey({ name: "app" });
if (!appGroupKey) throw new Error("Unable to find app group");

const widgetGroupKey = ensureGroup("DaimokuWidgetExtension", "DaimokuWidgetExtension");
objects.PBXGroup[widgetGroupKey].isa = "PBXGroup";
delete objects.PBXGroup[widgetGroupKey].path;

ensureBuildPhase(widgetTargetKey, "PBXSourcesBuildPhase", "Sources");
ensureBuildPhase(widgetTargetKey, "PBXFrameworksBuildPhase", "Frameworks");
ensureBuildPhase(widgetTargetKey, "PBXResourcesBuildPhase", "Resources");

ensureSourceMembership("app/DaimokuActivityAttributes.swift", appTargetKey, appGroupKey);
ensureSourceMembership("app/DaimokuLiveActivityModule.swift", appTargetKey, appGroupKey);
ensureSourceMembership("app/DaimokuLiveActivityModule.m", appTargetKey, appGroupKey);

const widgetSourceFiles = [
  "DaimokuWidgetExtension/DaimokuActivityAttributes.swift",
  "DaimokuWidgetExtension/DaimokuWidgetBundle.swift",
  "DaimokuWidgetExtension/DaimokuCounterWidget.swift",
  "DaimokuWidgetExtension/DaimokuLiveActivityWidget.swift",
];

for (const widgetSource of widgetSourceFiles) {
  removeSourceMembership(widgetSource, appTargetKey);
  ensureSourceMembership(widgetSource, widgetTargetKey, widgetGroupKey);
}

ensureFileReference("DaimokuWidgetExtension/Info.plist", widgetGroupKey);
ensureFileReference("DaimokuWidgetExtension/DaimokuWidgetExtension.entitlements", widgetGroupKey);

applyWidgetBuildSettings(widgetTargetKey);

if (!hasTargetDependency(appTargetKey, widgetTargetKey)) {
  project.addTargetDependency(appTargetKey, [widgetTargetKey]);
}

const copyPhase = (objects.PBXNativeTarget[appTargetKey].buildPhases || []).find((phase) => phase.comment === "Copy Files");
if (copyPhase) {
  copyPhase.comment = "Embed App Extensions";
  const copyObj = objects.PBXCopyFilesBuildPhase?.[copyPhase.value];
  if (copyObj) {
    copyObj.name = quote("Embed App Extensions");
    objects.PBXCopyFilesBuildPhase[`${copyPhase.value}_comment`] = "Embed App Extensions";
  }
}

fs.writeFileSync(projectPath, project.writeSync());
