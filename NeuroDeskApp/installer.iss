#define MyAppName "NeuroDesk"
#define MyAppVersion "1.0.3"
#define MyAppPublisher "NeuroDesk"
#define MyAppExeName "NeuroDesk.exe"

[Setup]
AppId={{8E3B8B2A-7C4F-4A5E-9D1B-2F6A9C3E5B7D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={userpf}\NeuroDesk
DefaultGroupName=NeuroDesk
UninstallDisplayIcon={app}\{#MyAppExeName}
OutputDir=D:\NeuroDesk\NeuroDeskApp\dist
OutputBaseFilename=NeuroDeskSetup-1.0.3
SetupIconFile=D:\NeuroDesk\NeuroDeskApp\build\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "D:\NeuroDesk\NeuroDeskApp\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent