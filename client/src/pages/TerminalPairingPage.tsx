import type { ChangeEvent } from "react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// --- Icons ---
const Icons = {
  Terminal: () => <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  QrCode: () => <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h-4v-2h4v-2h3v2m-3-2v3m-4 1h3m-1-5h-3m4-3h-4M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /></svg>, // Simplified generic
  Check: () => <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  ArrowRight: () => <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>,
  Copy: () => <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  Refresh: () => <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  Info: () => <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

// --- Components ---
interface InputProps {
  label: string;
  value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}

const Input = ({ label, value, onChange, placeholder, type = "text" }: InputProps) => (
  <div className="mb-4">
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
    />
  </div>
);

const StepIndicator = ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => (
  <div className="flex items-center justify-between mb-8 px-2 max-w-lg mx-auto">
    {Array.from({ length: totalSteps }).map((_, i) => (
      <div key={i} className="flex flex-col items-center relative z-10">
        <div 
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
            i + 1 <= currentStep 
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/30 scale-110" 
              : "bg-gray-100 text-gray-400 border border-gray-200"
          }`}
        >
          {i + 1 < currentStep ? <Icons.Check /> : i + 1}
        </div>
        <div className={`mt-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${i + 1 <= currentStep ? "text-blue-600" : "text-gray-400"}`}>
          {["Identify", "Pairing Code", "Confirm", "Done"][i]}
        </div>
      </div>
    ))}
    {/* Progress Line */}
    <div className="absolute top-4 left-0 w-full h-0.5 bg-gray-100 -z-0 px-8">
      <div 
        className="h-full bg-blue-600 transition-all duration-500 ease-out" 
        style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }} 
      />
    </div>
  </div>
);

export const TerminalPairingPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState("829 401");
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes

  const [data, setData] = useState({
    serialNumber: "",
    model: "Pax A920",
    terminalName: "Counter 1",
    location: "Main Store"
  });

  // Countdown timer for step 2
  useEffect(() => {
    if (step === 2 && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [step, timeLeft]);

  const handleNext = async () => {
    if (step < 4) {
      if (step === 3) {
        setLoading(true);
        // Simulate activation API call
        await new Promise(r => setTimeout(r, 2000));
        setLoading(false);
      }
      setStep(step + 1);
    } else {
      navigate("/terminals");
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const regenerateCode = () => {
    setPairingCode(Math.floor(100000 + Math.random() * 900000).toString().replace(/(\d{3})(\d{3})/, "$1 $2"));
    setTimeLeft(300);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Terminal Pairing & Activation</h1>
          <p className="text-sm text-gray-500 mt-1">Pair a new POS terminal and activate it for your merchant account</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
        
        <div className="w-full max-w-2xl">
          <StepIndicator currentStep={step} totalSteps={4} />

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 relative overflow-hidden">
             {/* Decorative Background */}
             <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-50 to-purple-50 rounded-bl-full opacity-50 -z-0 pointer-events-none"></div>

             <div className="relative z-10 min-h-[400px] flex flex-col">
               
               {/* Step 1: Device Identification */}
               {step === 1 && (
                 <div className="animate-slide-in-right flex-1">
                   <h2 className="text-xl font-bold text-gray-900 mb-2">Identify Terminal</h2>
                   <p className="text-gray-500 text-sm mb-6">Enter your terminal's details or scan the QR code found on the device screen.</p>
                   
                   <div className="space-y-4">
                     <Input 
                       label="Terminal Serial Number (S/N)" 
                       value={data.serialNumber} 
                       onChange={(e: any) => setData({...data, serialNumber: e.target.value})} 
                       placeholder="e.g. 123456789" 
                     />
                     <div className="p-3 bg-blue-50 rounded-lg flex items-start gap-3 text-xs text-blue-700 mb-4">
                       <Icons.Info />
                       <span>You can find the Serial Number on the back of the device or in the "About" settings menu.</span>
                     </div>

                     <Input 
                       label="Terminal Model" 
                       value={data.model} 
                       onChange={(e) => setData({...data, model: e.target.value})} 
                       placeholder="Select Model" 
                     />

                     <div className="relative">
                       <div className="absolute inset-0 flex items-center" aria-hidden="true">
                         <div className="w-full border-t border-gray-200" />
                       </div>
                       <div className="relative flex justify-center">
                         <span className="bg-white px-2 text-xs text-gray-400 font-medium uppercase tracking-wider">Or</span>
                       </div>
                     </div>

                     <button className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center gap-2 text-gray-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all group">
                       <Icons.QrCode />
                       <span className="font-medium">Scan QR Code</span>
                     </button>
                   </div>
                 </div>
               )}

               {/* Step 2: Generate Pairing Code */}
               {step === 2 && (
                 <div className="animate-slide-in-right flex-1 text-center">
                   <h2 className="text-xl font-bold text-gray-900 mb-2">Generate Pairing Code</h2>
                   <p className="text-gray-500 text-sm mb-8">Enter this code on your POS terminal to complete pairing.</p>

                   <div className="bg-gray-900 text-white rounded-2xl p-8 mb-6 relative overflow-hidden group">
                     <div className="text-5xl font-mono font-bold tracking-widest">{pairingCode}</div>
                     <div className="absolute top-4 right-4 text-gray-400 text-xs font-mono">
                       Expires in {formatTime(timeLeft)}
                     </div>
                     <button 
                        onClick={() => navigator.clipboard.writeText(pairingCode.replace(" ", ""))}
                        className="absolute bottom-4 right-4 p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                        title="Copy Code"
                     >
                       <Icons.Copy />
                     </button>
                   </div>

                   <button 
                     onClick={regenerateCode}
                     className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center gap-2 mx-auto"
                   >
                     <Icons.Refresh />
                     Regenerate Code
                   </button>
                 </div>
               )}

               {/* Step 3: Activation Confirmation */}
               {step === 3 && (
                 <div className="animate-slide-in-right flex-1">
                   <h2 className="text-xl font-bold text-gray-900 mb-2">Confirm Activation</h2>
                   <p className="text-gray-500 text-sm mb-6">Review the terminal details before activating.</p>

                   <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-6">
                     <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg">{data.model}</h3>
                          <p className="text-sm text-gray-500">S/N: {data.serialNumber || "SN-12345678"}</p>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wide">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          Connected
                        </div>
                     </div>
                     
                     <div className="space-y-3">
                       <Input 
                         label="Terminal Name" 
                         value={data.terminalName} 
                         onChange={(e) => setData({...data, terminalName: e.target.value})} 
                         placeholder="e.g. Front Counter" 
                       />
                       <Input 
                         label="Assign to Store / Location" 
                         value={data.location} 
                         onChange={(e) => setData({...data, location: e.target.value})} 
                         placeholder="Select Location" 
                       />
                     </div>
                   </div>
                 </div>
               )}

               {/* Step 4: Setup Complete */}
               {step === 4 && (
                 <div className="animate-slide-in-right flex-1 text-center flex flex-col items-center justify-center">
                   <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6 animate-bounce-in shadow-lg shadow-green-200">
                      <Icons.Check />
                   </div>
                   <h2 className="text-2xl font-bold text-gray-900 mb-2">Activation Successful!</h2>
                   <p className="text-gray-500 mb-8 max-w-sm">
                     Your terminal <span className="font-semibold text-gray-900">{data.terminalName}</span> has been successfully paired and is ready to process transactions.
                   </p>
                   
                   <div className="flex gap-4 w-full max-w-xs">
                     <button 
                       onClick={() => setStep(1)}
                       className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                     >
                       Pair Another
                     </button>
                   </div>
                 </div>
               )}

               {/* Navigation Buttons */}
               <div className="mt-auto pt-8 flex justify-between items-center border-t border-gray-100">
                 {step > 1 && step < 4 ? (
                   <button 
                     onClick={handleBack}
                     className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                   >
                     Back
                   </button>
                 ) : <div></div>}
                 
                 <button 
                   onClick={handleNext}
                   disabled={loading || (step === 1 && !data.serialNumber)}
                   className={`px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all flex items-center gap-2 ${loading || (step === 1 && !data.serialNumber) ? 'opacity-50 cursor-not-allowed' : ''}`}
                 >
                   {loading ? (
                     <>
                       <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                       Activating...
                     </>
                   ) : (
                     <>
                       {step === 4 ? "Go to Terminals" : step === 3 ? "Activate Terminal" : "Next Step"}
                       {step < 4 && <Icons.ArrowRight />}
                     </>
                   )}
                 </button>
               </div>

             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
