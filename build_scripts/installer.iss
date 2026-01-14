; FOCUS Installer Script
; Inno Setup 6.x Required
; Download: https://jrsoftware.org/isdl.php

#define MyAppName "FOCUS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Milan Hommet"
#define MyAppURL "https://github.com/milanhommet/FOCUS"
#define MyAppExeName "FOCUS.exe"

[Setup]
; Basic Information
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
OutputDir=..\dist\installer
OutputBaseFilename=FOCUS_Setup_v{#MyAppVersion}
SetupIconFile=..\web\logo.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
; Main application files from PyInstaller output
Source: "..\dist\FOCUS\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
// Check if League of Legends is installed
function IsLoLInstalled: Boolean;
var
  LoLPath: String;
begin
  // Check common installation paths
  Result := DirExists('C:\Riot Games\League of Legends') or
            DirExists('C:\Program Files\Riot Games\League of Legends') or
            DirExists('C:\Program Files (x86)\Riot Games\League of Legends') or
            DirExists('D:\Riot Games\League of Legends');

  if not Result then
  begin
    MsgBox('Note: League of Legends installation not detected.' + #13#10 +
           'FOCUS works best when League of Legends is installed.',
           mbInformation, MB_OK);
  end;
end;

// Pre-installation check
function InitializeSetup: Boolean;
begin
  Result := True;
  IsLoLInstalled; // Show info if not installed
end;
