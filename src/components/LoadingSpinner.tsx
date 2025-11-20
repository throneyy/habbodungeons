import loadingHabbos from "@/assets/loading-habbos.gif";

export const LoadingSpinner = () => {
  return (
    <div className="flex items-center justify-center">
      <img 
        src={loadingHabbos} 
        alt="Loading" 
        className="pixel-icon"
        style={{ width: 'auto', height: 'auto' }}
      />
    </div>
  );
};
